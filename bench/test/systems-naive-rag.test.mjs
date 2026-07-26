import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkNote, run, name, TOP_K } from '../lib/systems/naive-rag.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(here, '../fixtures/ci-vault');

describe('chunkNote', () => {
  it('returns one chunk for a short note', () => {
    const cs = chunkNote('short body', 'a.md', 512, 64);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toEqual({ path: 'a.md', text: 'short body', index: 0 });
  });

  it('splits a long note into overlapping chunks', () => {
    const body = 'word '.repeat(2000);
    const cs = chunkNote(body, 'a.md', 512, 64);
    expect(cs.length).toBeGreaterThan(1);
    expect(cs.every(c => c.path === 'a.md')).toBe(true);
    expect(cs.map(c => c.index)).toEqual(cs.map((_, i) => i));
  });

  it('overlaps consecutive chunks', () => {
    const body = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(' ');
    const cs = chunkNote(body, 'a.md', 512, 64);
    const tailOfFirst = cs[0].text.trim().split(/\s+/).slice(-10);
    expect(cs[1].text).toContain(tailOfFirst[0]);
  });

  it('never emits an empty chunk', () => {
    expect(chunkNote('', 'a.md', 512, 64)).toEqual([]);
  });
});

describe('naive-rag', () => {
  const embedder = {
    id: 'stub', dim: 2,
    // "crack temperature" (the query phrase) and "196" (first-crack.md's
    // roast log) both point along x; everything else points along y. Using
    // the bare word "crack" would tie three notes at cosine 1.0 — see
    // task-12-report.md Resolution 2 for the verification against the fixture.
    async embed(texts) {
      return texts.map(t => Float32Array.from(/196|crack temperature/i.test(t) ? [1, 0] : [0, 1]));
    },
  };

  it('exports the contract name', () => expect(name).toBe('naive-rag'));

  it('ships a calibrated, documented TOP_K', () => {
    // Pinned to the value scripts/calibrate-naive-rag.mjs actually produced
    // (see task-12-report.md) so a future recalibration must update this
    // test deliberately instead of drifting silently.
    expect(TOP_K).toBe(12);
  });

  it('returns the contract shape', async () => {
    const r = await run('crack temperature', { vaultDir: VAULT, embedder });
    expect(typeof r.promptPayload).toBe('string');
    expect(Array.isArray(r.citedPaths)).toBe(true);
    expect(r.retrievalTokens).toBe(0);
    expect(r.citedPaths.length).toBeLessThanOrEqual(TOP_K);
  });

  it('ranks the semantically matching note first', async () => {
    const r = await run('crack temperature', { vaultDir: VAULT, embedder });
    expect(r.citedPaths[0]).toBe('notes/first-crack.md');
  });

  it('deduplicates paths when several chunks of one note rank', async () => {
    // Both chunks belong to the same path and both rank into the top-k (the
    // stub embeds each along x, same as the query), so this only passes if
    // run() actually dedupes — removing the Set(...) in naive-rag.mjs makes
    // citedPaths come back as ['a.md', 'a.md'].
    const r = await run('crack temperature', {
      vaultDir: VAULT,
      embedder,
      chunks: [
        { path: 'a.md', text: 'crack temperature', index: 0 },
        { path: 'a.md', text: '196 C', index: 1 },
      ],
    });
    expect(r.citedPaths).toEqual(['a.md']);
  });
});
