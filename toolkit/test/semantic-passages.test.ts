// That a long note can be found by something written deep inside it.
//
// ── The counterfactual ─────────────────────────────────────────────────────
//
// The embedder here reads only the first two thousand characters of whatever it
// is handed, which is what a real transformer embedder does: it attends about
// 512 tokens and the rest of the input never reaches it. Under that embedder
// the first test shows the defect directly — the long note's own vector comes
// out IDENTICAL to an unrelated note's, because all the model ever saw of
// either was filler. Not ranked low. Indistinguishable.
//
// That is the whole case for passages, and it is why this file embeds through a
// truncating stub rather than asserting on a real model: with a real model the
// claim would be a number that drifts, and here it is an equality.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { semanticRanking, semanticQueryRanking } from '../src/semantic/queryRank.js';
import { runEmbed } from '../src/commands/embed.js';
import { loadStore } from '../src/semantic/store.js';
import { loadConfig } from '../src/config.js';
import { scanVault, collectFrontmatterKeys } from '../src/vault.js';
import type { Embedder } from '../src/semantic/embedder.js';

/** What the model actually gets to read. */
const WINDOW = 2000;

/**
 * An embedder with a window, like every real one.
 *
 * Three dimensions, decided by what it can see: the needle, or filler. Nothing
 * about the arithmetic matters here — what matters is that it cannot see past
 * WINDOW, which is the property the whole change exists for.
 */
const stub: Embedder = {
  id: 'trunc', dim: 3,
  async embed(texts) {
    return texts.map((t) => {
      const seen = t.slice(0, WINDOW);
      return Float32Array.from(seen.includes('ZETA') ? [0, 0, 1] : [0, 1, 0]);
    });
  },
};

const filler = (n: number): string =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i}. ${'ordinary wording '.repeat(12)}`).join('\n\n');

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-sp-'));
  mkdirSync(join(dir, 'N'));
  // The needle sits at the end, far past anything the embedder can read of the
  // note as a whole.
  writeFileSync(join(dir, 'N', 'long.md'), `# Long\n\n${filler(30)}\n\nThe ZETA clause closes the matter.`);
  writeFileSync(join(dir, 'N', 'other.md'), `# Other\n\n${filler(30)}`);
  return dir;
}

async function prepared() {
  const dir = vault();
  const config = loadConfig(dir, collectFrontmatterKeys(dir));
  const result = await runEmbed(dir, { embedder: stub, model: config.embedModel });
  return { dir, config, notes: scanVault(dir, config), result, store: loadStore(resolve(dir, config.embedDir))! };
}

describe('a long note and the model window', () => {
  it('without passages the long note is indistinguishable from an unrelated one', async () => {
    // The defect, stated as an equality. Both notes were embedded whole, both
    // were cut at the window, and all the model saw of either was filler — so
    // the two vectors are the same vector. No ranking can separate them.
    const { store } = await prepared();
    const long = store.records.find(r => r.path.endsWith('long.md'))!;
    const other = store.records.find(r => r.path.endsWith('other.md'))!;
    expect(Array.from(long.vector)).toEqual(Array.from(other.vector));
  });

  it('both notes are long, so both contribute passages', async () => {
    const { result, store } = await prepared();
    expect(result.chunked).toBe(2);
    expect(store.passages!.length).toBeGreaterThan(2);
  });

  it('the note is found by what is written deep inside it', async () => {
    const { dir, config, notes } = await prepared();
    const { order } = await semanticRanking(dir, config, notes, 'ZETA', stub);
    expect(order[0]).toBe('long');
  });

  it('the winning passage is reported, and it is the one holding the needle', async () => {
    // The window is what lets the citation come from the part that made the
    // note appear, instead of from the document's first page.
    const { dir, config, notes } = await prepared();
    const { windows } = await semanticRanking(dir, config, notes, 'ZETA', stub);
    const w = windows.get('long')!;
    expect(w).toBeDefined();
    const body = notes.find(n => n.id === 'long')!.body;
    expect(body.slice(w.start, w.end)).toContain('ZETA');
  });

  it('a note that won on its own vector reports no window', async () => {
    // There is nothing to point at: the whole note is what matched.
    const { dir, config, notes } = await prepared();
    const { windows } = await semanticRanking(dir, config, notes, 'nothing in particular', stub);
    expect(windows.has('other')).toBe(false);
  });

  it('every note is still ranked, each one once', async () => {
    // Taking the best passage must not turn one note into several hits.
    const { dir, config, notes } = await prepared();
    const { order } = await semanticRanking(dir, config, notes, 'ZETA', stub);
    expect(order).toHaveLength(2);
    expect(new Set(order).size).toBe(2);
  });

  it('the ranking-only entry point agrees with the full one', async () => {
    const { dir, config, notes } = await prepared();
    const { order } = await semanticRanking(dir, config, notes, 'ZETA', stub);
    expect(await semanticQueryRanking(dir, config, notes, 'ZETA', stub)).toEqual(order);
  });

  it('with no store at all it degrades to nothing, windows included', async () => {
    const dir = vault();
    const config = loadConfig(dir, collectFrontmatterKeys(dir));
    const notes = scanVault(dir, config);
    const r = await semanticRanking(dir, config, notes, 'ZETA', stub);
    expect(r.order).toEqual([]);
    expect(r.windows.size).toBe(0);
  });

  it('an edited note is skipped rather than ranked on a stale vector', async () => {
    const { dir, config } = await prepared();
    writeFileSync(join(dir, 'N', 'long.md'), '# Long\n\nrewritten from scratch, nothing of the old text.');
    const notes = scanVault(dir, config);
    const { order } = await semanticRanking(dir, config, notes, 'ZETA', stub);
    expect(order).not.toContain('long');
  });
});
