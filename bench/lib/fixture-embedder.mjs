// An Embedder backed by precomputed vectors. Cortex's semanticQueryRanking
// takes an injectable embedder and only embeds the *query* — note vectors come
// from the committed store — so injecting this makes the real semantic ranking
// path deterministic, offline, and free in CI.
//
// A cache miss throws. Returning a zero vector instead would silently rank
// every note identically and look like a retrieval regression.
import { readFileSync } from 'node:fs';

/** Strip the e5 instruction prefix so cached raw questions match prefixed lookups. */
export function normalise(text) {
  return text.replace(/^\s*(query|passage):\s*/i, '').trim();
}

/**
 * @param {string} cachePath  JSON: { model, dim, vectors: { [text]: number[] } }
 * @returns {{ id: string, dim: number, embed(texts: string[]): Promise<Float32Array[]> }}
 */
export function createCachedEmbedder(cachePath) {
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  const byKey = new Map();
  for (const [k, v] of Object.entries(cache.vectors)) byKey.set(normalise(k), v);

  return {
    id: cache.model,
    dim: cache.dim,
    async embed(texts) {
      return texts.map(t => {
        const vec = byKey.get(normalise(t));
        if (!vec) {
          throw new Error(
            `fixture-embedder: cache miss for "${t}" in ${cachePath}. ` +
            `Re-run: node bench/scripts/build-fixture-embeddings.mjs`,
          );
        }
        return Float32Array.from(vec);
      });
    },
  };
}
