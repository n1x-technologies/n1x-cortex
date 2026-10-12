// What `cortex embed` does with a note too long for the model to read whole.
//
// The expensive mistake here would be re-embedding every passage of a long
// document whenever one line of it changes. On a two-hundred-thousand-character
// import that is a hundred and forty model calls to pay for one edit, so the
// hash is of the passage text and not of the note.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { runEmbed, formatEmbed } from '../src/commands/embed.js';
import { loadStore, storePath } from '../src/semantic/store.js';
import { loadConfig } from '../src/config.js';
import { collectFrontmatterKeys } from '../src/vault.js';
import type { Embedder } from '../src/semantic/embedder.js';

/** An embedder that remembers every text it was asked to embed. */
function recording(): Embedder & { asked: string[][] } {
  const asked: string[][] = [];
  return {
    id: 'rec', dim: 3, asked,
    async embed(texts) {
      asked.push([...texts]);
      return texts.map(() => Float32Array.from([1, 0, 0]));
    },
  };
}

/** `n` paragraphs, each long enough that a handful overflow one passage. */
const filler = (n: number): string =>
  Array.from({ length: n }, (_, i) => `Paragraph ${i}. ${'detail '.repeat(30)}`).join('\n\n');

function vault(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-ep-'));
  mkdirSync(join(dir, 'N'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'N', name), body);
  return dir;
}

const model = (dir: string) => loadConfig(dir, collectFrontmatterKeys(dir)).embedModel;
/** Where `runEmbed` actually writes — the configured directory, not the vault root. */
const embedDir = (dir: string) => resolve(dir, loadConfig(dir, collectFrontmatterKeys(dir)).embedDir);

describe('embedding a long note', () => {
  it('a vault of short notes stores no passage vectors', () => {
    // A note that fits the window is already covered by its own vector, and
    // storing the same vector twice only makes the file bigger.
    const dir = vault({ 'a.md': '# A\n\nshort and done.' });
    return runEmbed(dir, { embedder: recording(), model: model(dir) }).then((r) => {
      expect(r.chunked).toBe(0);
      expect(r.passages).toBe(0);
      expect(loadStore(embedDir(dir))!.passages ?? []).toEqual([]);
    });
  });

  it('a long note gets one vector per passage, on top of its note vector', async () => {
    const dir = vault({ 'long.md': `# Long\n\n${filler(40)}`, 'short.md': '# Short\n\ntiny.' });
    const r = await runEmbed(dir, { embedder: recording(), model: model(dir) });
    expect(r.chunked).toBe(1);
    expect(r.passages).toBeGreaterThan(1);
    const s = loadStore(embedDir(dir))!;
    expect(s.records).toHaveLength(2); // one per note, as before
    expect(s.passages!.every(p => p.path.endsWith('long.md'))).toBe(true);
    expect(s.passages).toHaveLength(r.passages);
  });

  it('nothing changed means nothing is embedded again', async () => {
    const dir = vault({ 'long.md': `# Long\n\n${filler(40)}` });
    await runEmbed(dir, { embedder: recording(), model: model(dir) });
    const again = recording();
    const r = await runEmbed(dir, { embedder: again, model: model(dir) });
    expect(again.asked).toEqual([]); // the embedder was never called
    expect(r.reused).toBe(1);
    expect(r.passages).toBeGreaterThan(1);
  });

  it('editing the end of a long note re-embeds that passage, not all of them', async () => {
    const dir = vault({ 'long.md': `# Long\n\n${filler(600)}` });
    const first = await runEmbed(dir, { embedder: recording(), model: model(dir) });
    expect(first.passages).toBeGreaterThan(10); // enough passages for the claim to mean something

    writeFileSync(join(dir, 'N', 'long.md'), `# Long\n\n${filler(600)}\n\nOne new closing paragraph.`);
    const again = recording();
    const second = await runEmbed(dir, { embedder: again, model: model(dir) });

    const asked = again.asked.flat();
    // The note vector always changes — its hash is over the whole body — so one
    // of these is the note itself. The point is the rest of the passages.
    expect(asked.length).toBeLessThan(first.passages / 2);
    expect(second.passages).toBeGreaterThanOrEqual(first.passages);
  });

  it('a deleted note takes its passages with it', async () => {
    const dir = vault({ 'long.md': `# Long\n\n${filler(40)}`, 'keep.md': '# Keep\n\nstays.' });
    const before = await runEmbed(dir, { embedder: recording(), model: model(dir) });
    expect(before.passages).toBeGreaterThan(1);

    rmSync(join(dir, 'N', 'long.md'));
    const after = await runEmbed(dir, { embedder: recording(), model: model(dir) });
    expect(after.passages).toBe(0);
    expect(loadStore(embedDir(dir))!.passages ?? []).toEqual([]);
    // And the catalogue goes back to the format every earlier version reads.
    expect(JSON.parse(readFileSync(storePath(embedDir(dir)), 'utf8')).format).toBe(2);
  });

  it('notes and passages are embedded in one call, not two', async () => {
    // They are the same work for the embedder, and on a remote backend two
    // calls are two round trips.
    const dir = vault({ 'long.md': `# Long\n\n${filler(40)}` });
    const rec = recording();
    await runEmbed(dir, { embedder: rec, model: model(dir) });
    expect(rec.asked).toHaveLength(1);
  });

  it('the report mentions passages only when there were any', async () => {
    const dir = vault({ 'long.md': `# Long\n\n${filler(40)}` });
    const withLong = await runEmbed(dir, { embedder: recording(), model: model(dir) });
    expect(formatEmbed(withLong)).toMatch(/passage vectors from 1 note/);

    const plain = vault({ 'a.md': '# A\n\nshort.' });
    const withoutLong = await runEmbed(plain, { embedder: recording(), model: model(plain) });
    expect(formatEmbed(withoutLong)).not.toMatch(/passage/);
  });
});
