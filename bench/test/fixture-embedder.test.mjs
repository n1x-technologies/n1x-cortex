import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCachedEmbedder } from '../lib/fixture-embedder.mjs';

const here = dirname(fileURLToPath(import.meta.url));

describe('createCachedEmbedder', () => {
  it('returns the cached vector as a Float32Array', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'emb-'));
    const p = join(dir, 'v.json');
    writeFileSync(p, JSON.stringify({ model: 'm', dim: 3, vectors: { 'query: hello': [1, 0, 0] } }));
    const e = createCachedEmbedder(p);
    expect(e.dim).toBe(3);
    expect(e.id).toBe('m');
    const [v] = await e.embed(['query: hello']);
    expect(v).toBeInstanceOf(Float32Array);
    expect(Array.from(v)).toEqual([1, 0, 0]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws a named error on a cache miss rather than returning zeros', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'emb-'));
    const p = join(dir, 'v.json');
    writeFileSync(p, JSON.stringify({ model: 'm', dim: 3, vectors: {} }));
    const e = createCachedEmbedder(p);
    await expect(e.embed(['query: nope'])).rejects.toThrow(/cache miss.*query: nope/s);
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves the shipped fixture cache with the prefixed question text', async () => {
    const e = createCachedEmbedder(resolve(here, '../fixtures/query-vectors.json'));
    const [v] = await e.embed(['query: At what temperature does first crack occur?']);
    expect(v.length).toBe(e.dim);
  });
});
