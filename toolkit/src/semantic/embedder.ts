export interface Embedder {
  readonly id: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

/**
 * The id the embedding store records, and the key it decides reuse on.
 *
 * A store keeps one model id and reuses any vector still matching it. Two
 * backends can answer to the same model name and return vectors from different
 * spaces, and mixing them corrupts a store with nothing to see: every reused
 * vector sits in a space the new ones are not in, and cosine similarity goes on
 * returning plausible nonsense. So a remote store's id carries its endpoint,
 * which makes switching backends a full re-embed instead of a silent mix.
 */
export function embedStoreId(spec: { model: string; baseUrl?: string }): string {
  if (!spec.baseUrl) return spec.model;
  const host = spec.baseUrl.replace(/\/+$/, '').replace(/^https?:\/\//, '');
  return `remote:${host}:${spec.model}`;
}

export interface RemoteEmbedderOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Inputs per request. The wire format takes an array; unbounded is a footgun. */
  batchSize?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * An Embedder backed by an OpenAI-compatible `/embeddings` endpoint.
 *
 * `cortex atomize` already accepts a remote endpoint; this is the same class of
 * work, and there was no reason for embedding to be local-only. It also removes
 * the hard dependency on `@huggingface/transformers` for anyone who cannot ship
 * onnxruntime or download a model at runtime.
 */
export function createRemoteEmbedder(opts: RemoteEmbedderOptions): Embedder {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/embeddings`;
  const batchSize = opts.batchSize ?? 64;
  const doFetch = opts.fetchImpl ?? fetch;
  let dim = 0;

  async function embedBatch(texts: string[]): Promise<Float32Array[]> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    // Only when present: local compat servers commonly reject an empty bearer
    // token outright, so sending `Bearer ` is worse than sending nothing.
    if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

    const res = await doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: opts.model, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`embeddings request failed: ${res.status} ${res.statusText}\n${await res.text()}`);
    }
    const body = await res.json() as { data?: Array<{ embedding: number[]; index?: number }> };
    const data = body.data;
    if (!Array.isArray(data)) throw new Error('embeddings response has no "data" array');
    if (data.length !== texts.length) {
      throw new Error(`expected ${texts.length} embeddings, got ${data.length}`);
    }

    // Placed by `index` when the server sends one. The wire format carries it
    // precisely because response order is not guaranteed, and trusting array
    // position would attach each note to another note's vector — every
    // retrieval wrong, and nothing anywhere to indicate it.
    const out = new Array<Float32Array>(texts.length);
    data.forEach((item, i) => {
      const at = typeof item.index === 'number' ? item.index : i;
      if (at < 0 || at >= texts.length) throw new Error(`embeddings response index ${at} out of range`);
      out[at] = normalise(item.embedding);
    });
    for (let i = 0; i < out.length; i++) {
      if (!out[i]) throw new Error(`embeddings response is missing index ${i}`);
    }
    if (out.length) dim = out[0].length;
    return out;
  }

  return {
    id: embedStoreId({ model: opts.model, baseUrl: opts.baseUrl }),
    get dim() { return dim; },
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        out.push(...await embedBatch(texts.slice(i, i + batchSize)));
      }
      return out;
    },
  };
}

/**
 * The local embedder passes `normalize: true` and the store's cosine similarity
 * assumes unit vectors. A compat server that returns unnormalised ones would
 * make remote and local stores quietly incomparable, so normalising here keeps
 * one invariant for both backends. An all-zero vector is left alone rather than
 * turned into NaN.
 */
function normalise(values: number[]): Float32Array {
  const v = Float32Array.from(values);
  let sum = 0;
  for (const x of v) sum += x * x;
  const len = Math.sqrt(sum);
  if (len === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] /= len;
  return v;
}

export async function createTransformersEmbedder(modelId: string, cacheDir: string): Promise<Embedder> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = cacheDir;
  env.allowLocalModels = false;
  // dtype: 'q8' matches the quantized default of the former @xenova/transformers,
  // so embeddings stay bit-identical to any store generated before this migration.
  const extractor = await pipeline('feature-extraction', modelId, { dtype: 'q8' });
  let dim = 0;
  return {
    id: modelId,
    get dim() { return dim; },
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (const t of texts) {
        const res = await extractor(t, { pooling: 'mean', normalize: true });
        const vec = res.data as Float32Array;
        dim = vec.length;
        out.push(Float32Array.from(vec));
      }
      return out;
    },
  };
}
