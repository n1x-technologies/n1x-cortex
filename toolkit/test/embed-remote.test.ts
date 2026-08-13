// `cortex atomize` has always accepted a remote OpenAI-compatible endpoint;
// `cortex embed` could only ever build a local on-device store. Same class of
// work — send text to a model, get a response — solved two different ways, so
// an endpoint already configured for atomize could not be reused here. A
// consumer deploying into a container hit this: @huggingface/transformers pulls
// onnxruntime (hundreds of MB) and downloads the model at runtime, which their
// network would not allow, so they wrote ~300 lines of embedding client, vector
// index and cosine search outside cortex to reach where `cortex query` already
// claims to go.
import { describe, it, expect } from 'vitest';
import { createRemoteEmbedder, embedStoreId } from '../src/semantic/embedder.js';
import { parseEmbedArgs } from '../src/commands/embed.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Records every request so batching and payload shape are assertable. */
function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; body: any }> = [];
  const fn = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const vec = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('embedStoreId', () => {
  it('is the bare model id for the local backend', () => {
    expect(embedStoreId({ model: 'Xenova/all-MiniLM-L6-v2' })).toBe('Xenova/all-MiniLM-L6-v2');
  });

  it('encodes the endpoint for a remote backend', () => {
    // The store keeps ONE model id and reuses vectors whenever it matches.
    // Two backends can answer to the same model name and return different
    // vectors, and mixing them corrupts a store silently — every reused vector
    // stays in a space the new ones are not in, and cosine similarity keeps
    // returning plausible nonsense. The id has to distinguish them.
    const id = embedStoreId({ model: 'text-embedding-3-small', baseUrl: 'http://127.0.0.1:8787/v1' });
    expect(id).not.toBe('text-embedding-3-small');
    expect(id).toContain('text-embedding-3-small');
    expect(id).toContain('127.0.0.1:8787');
  });

  it('is stable across a trailing slash', () => {
    expect(embedStoreId({ model: 'm', baseUrl: 'http://h/v1/' }))
      .toBe(embedStoreId({ model: 'm', baseUrl: 'http://h/v1' }));
  });

  it('distinguishes two endpoints serving the same model name', () => {
    expect(embedStoreId({ model: 'm', baseUrl: 'http://a/v1' }))
      .not.toBe(embedStoreId({ model: 'm', baseUrl: 'http://b/v1' }));
  });
});

describe('createRemoteEmbedder', () => {
  it('posts to <baseUrl>/embeddings with the model and inputs', async () => {
    const { fn, calls } = stubFetch(() => jsonResponse({ data: [{ embedding: vec(4, 0.5) }] }));
    const e = createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', apiKey: 'k', fetchImpl: fn });
    await e.embed(['hello']);
    expect(calls[0].url).toBe('http://h/v1/embeddings');
    expect(calls[0].body.model).toBe('m');
    expect(calls[0].body.input).toEqual(['hello']);
  });

  it('normalises vectors to unit length', async () => {
    // The local embedder passes normalize: true, and the store's cosine
    // similarity assumes it. A compat server that returns unnormalised vectors
    // would otherwise make remote and local stores incomparable, with no error
    // anywhere — just worse ranking.
    const { fn } = stubFetch(() => jsonResponse({ data: [{ embedding: [3, 4, 0, 0] }] }));
    const e = createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', fetchImpl: fn });
    const [out] = await e.embed(['x']);
    expect(Math.hypot(...out)).toBeCloseTo(1, 6);
    expect(out[0]).toBeCloseTo(0.6, 6);
    expect(out[1]).toBeCloseTo(0.8, 6);
  });

  it('leaves an all-zero vector alone instead of dividing by zero', async () => {
    const { fn } = stubFetch(() => jsonResponse({ data: [{ embedding: [0, 0, 0] }] }));
    const e = createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', fetchImpl: fn });
    const [out] = await e.embed(['x']);
    expect([...out]).toEqual([0, 0, 0]);
  });

  it('batches large inputs and keeps the results in order', async () => {
    let n = 0;
    const { fn, calls } = stubFetch((_u, init) => {
      const inputs = JSON.parse(String(init.body)).input as string[];
      return jsonResponse({ data: inputs.map(() => ({ embedding: vec(2, ++n) })) });
    });
    const e = createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', batchSize: 2, fetchImpl: fn });
    const out = await e.embed(['a', 'b', 'c', 'd', 'e']);
    expect(calls.length).toBe(3);
    expect(calls.map(c => c.body.input)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(out.length).toBe(5);
  });

  it('reorders a response that comes back out of order', async () => {
    // The OpenAI wire format carries an `index` per item precisely because the
    // order is not guaranteed. Trusting array position would silently attach
    // each note to another note's vector — every retrieval wrong, nothing to see.
    const { fn } = stubFetch(() => jsonResponse({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    }));
    const e = createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', fetchImpl: fn });
    const out = await e.embed(['first', 'second']);
    expect([...out[0]]).toEqual([1, 0]);
    expect([...out[1]]).toEqual([0, 1]);
  });

  it('fails loudly when the response is short of inputs', async () => {
    const { fn } = stubFetch(() => jsonResponse({ data: [{ embedding: vec(2, 1) }] }));
    const e = createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', fetchImpl: fn });
    await expect(e.embed(['a', 'b'])).rejects.toThrow(/2 embeddings.*got 1|expected 2/i);
  });

  it('surfaces an HTTP error with status and body', async () => {
    const { fn } = stubFetch(() => new Response('no such model', { status: 404 }));
    const e = createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', fetchImpl: fn });
    await expect(e.embed(['a'])).rejects.toThrow(/404.*no such model/s);
  });

  it('sends Authorization only when a key is present', async () => {
    const seen: Array<Record<string, string>> = [];
    const fn = (async (_u: any, init: any) => {
      seen.push({ ...(init.headers as Record<string, string>) });
      return jsonResponse({ data: [{ embedding: vec(2, 1) }] });
    }) as unknown as typeof fetch;
    // Local compat servers commonly reject an empty bearer token outright.
    await createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', fetchImpl: fn }).embed(['a']);
    expect(seen[0].Authorization).toBeUndefined();
    await createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', apiKey: 'k', fetchImpl: fn }).embed(['a']);
    expect(seen[1].Authorization).toBe('Bearer k');
  });

  it('reports dim from the vectors it received', async () => {
    const { fn } = stubFetch(() => jsonResponse({ data: [{ embedding: vec(384, 1) }] }));
    const e = createRemoteEmbedder({ baseUrl: 'http://h/v1', model: 'm', fetchImpl: fn });
    expect(e.dim).toBe(0);
    await e.embed(['a']);
    expect(e.dim).toBe(384);
  });
});

describe('parseEmbedArgs', () => {
  it('reads the flags it supports', () => {
    const a = parseEmbedArgs(['--force', '--model', 'm', '--base-url', 'http://h/v1']);
    expect(a).toEqual({ force: true, model: 'm', baseUrl: 'http://h/v1' });
  });

  it('defaults to the local backend with no flags', () => {
    expect(parseEmbedArgs([])).toEqual({ force: false });
  });

  it('rejects an unknown option instead of ignoring it', () => {
    // The reported bug: `cortex embed --base-url http://...` silently dropped
    // the flag, fell through to the local backend, and reported a missing
    // package. The user was told to install something to fix a request that
    // had never been honoured.
    expect(() => parseEmbedArgs(['--baseurl', 'http://h'])).toThrow(/unknown option.*--baseurl/i);
    expect(() => parseEmbedArgs(['--json'])).toThrow(/unknown option/i);
  });

  it('rejects a flag whose value is missing or is another flag', () => {
    expect(() => parseEmbedArgs(['--base-url'])).toThrow(/--base-url needs a value/i);
    expect(() => parseEmbedArgs(['--model', '--force'])).toThrow(/--model needs a value/i);
  });
});
