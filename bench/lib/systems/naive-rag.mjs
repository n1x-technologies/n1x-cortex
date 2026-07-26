// The industry-default baseline: fixed-size chunks, one embedding each, cosine
// top-k. Deliberately uses THE SAME embedding model as Cortex, so the
// comparison isolates what Cortex's structure — graph, frontmatter, RRF fusion
// — contributes, rather than measuring one embedder against another.
//
// TOP_K is calibrated, not guessed: scripts/calibrate-naive-rag.mjs picks the
// value whose median payload lands within 10% of Cortex's on the same corpus.
// Matching the cost budget is what makes an accuracy difference attributable
// to retrieval structure instead of to a larger context allowance.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walkVault } from '../corpus.mjs';

export const name = 'naive-rag';

export const CHUNK_CHARS = 2048;   // ~512 tokens
export const OVERLAP_CHARS = 256;  // ~64 tokens
export const TOP_K = 12; // calibrated 2026-07-25: 966 projected vs 982 cortex median (1.6% drift) — scripts/calibrate-naive-rag.mjs
// NOTE: the ci-vault fixture has exactly 12 notes, each short enough to be a
// single chunk, so this TOP_K covers the whole corpus and naive-rag becomes
// indistinguishable from full-context on THIS fixture. That's an honest
// property of the small fixture, not a bug — see task-12-report.md.

/**
 * @returns {{path: string, text: string, index: number}[]}
 */
export function chunkNote(text, path, size = CHUNK_CHARS, overlap = OVERLAP_CHARS) {
  if (!text) return [];
  const step = size - overlap;
  const out = [];
  for (let start = 0, index = 0; start < text.length; start += step, index++) {
    const slice = text.slice(start, start + size);
    if (!slice) break;
    out.push({ path, text: slice, index });
    if (start + size >= text.length) break;
  }
  return out;
}

export function buildChunks(vaultDir) {
  return walkVault(vaultDir).flatMap(abs =>
    chunkNote(readFileSync(abs, 'utf8'), relative(vaultDir, abs)),
  );
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function run(question, ctx) {
  const t0 = performance.now();

  const chunks = ctx.chunks ?? buildChunks(ctx.vaultDir);
  const vectors = ctx.chunkVectors
    ? chunks.map(c => {
        const key = `${c.path}#${c.index}`;
        const vec = ctx.chunkVectors.get(key);
        if (!vec) {
          throw new Error(
            `naive-rag: missing chunk vector for "${key}". A cache miss means the ` +
            `benchmark run is broken, not slightly worse — regenerate the chunk ` +
            `vector cache instead of letting cosine() see undefined.`,
          );
        }
        return vec;
      })
    : await ctx.embedder.embed(chunks.map(c => `passage: ${c.text}`));

  const [qvec] = await ctx.embedder.embed([`query: ${question}`]);

  const ranked = chunks
    .map((c, i) => ({ chunk: c, score: cosine(qvec, vectors[i]) }))
    .sort((a, b) => b.score - a.score);

  // Take the top-k chunks, then dedupe paths for citation scoring — a note is
  // either retrieved or not, regardless of how many of its chunks ranked.
  const top = ranked.slice(0, TOP_K);
  const citedPaths = [...new Set(top.map(t => t.chunk.path))];
  const promptPayload = top
    .map(t => `### ${t.chunk.path} (chunk ${t.chunk.index})\n${t.chunk.text}`)
    .join('\n\n');

  return { promptPayload, citedPaths, latencyMs: performance.now() - t0, retrievalTokens: 0 };
}
