import { describe, it, expect } from 'vitest';
import { runEmbed } from '../src/commands/embed.js';
import { loadStore } from '../src/semantic/store.js';
import type { Embedder } from '../src/semantic/embedder.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// deterministic stub: vector depends on whether text mentions "alpha"
const stub: Embedder = {
  id: 'stub', dim: 3,
  async embed(texts) { return texts.map(t => Float32Array.from(t.includes('alpha') ? [1, 0, 0] : [0, 1, 0])); },
};

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-embed-'));
  mkdirSync(join(dir, 'N'));
  writeFileSync(join(dir, 'N', 'a.md'), '# A\n\nalpha content here');
  writeFileSync(join(dir, 'N', 'b.md'), '# B\n\nbeta content here');
  return dir;
}

describe('runEmbed', () => {
  it('embeds all notes on first run and writes the store', async () => {
    const dir = vault();
    const r = await runEmbed(dir, { embedder: stub, model: 'stub' });
    expect(r.added).toBe(2);
    expect(r.changed).toBe(0);
    expect(r.total).toBe(2);
    const store = loadStore(resolve(dir, '.cortex/embeddings'));
    expect(store!.model).toBe('stub');
    expect(store!.records.length).toBe(2);
    expect(store!.dim).toBe(3);
  });

  it('reuses unchanged notes and re-embeds only edits on the second run', async () => {
    const dir = vault();
    await runEmbed(dir, { embedder: stub, model: 'stub' });
    writeFileSync(join(dir, 'N', 'a.md'), '# A\n\nalpha content EDITED');
    const r = await runEmbed(dir, { embedder: stub, model: 'stub' });
    expect(r.reused).toBe(1);
    expect(r.changed).toBe(1);
    expect(r.added).toBe(0);
  });

  it('surfaces a friendly error when the embedder factory fails (offline first-run)', async () => {
    const dir = vault();
    await expect(
      runEmbed(dir, {
        embedderFactory: async () => { throw new Error('offline'); },
        model: 'stub',
      }),
    ).rejects.toThrow(/could not download model "stub"/);
  });

  it('drops deleted notes from the store count via removed', async () => {
    const dir = vault();
    await runEmbed(dir, { embedder: stub, model: 'stub' });
    // simulate deletion by pointing a second vault run at fewer notes is overkill;
    // instead re-run after removing b.md
    const { rmSync } = await import('node:fs');
    rmSync(join(dir, 'N', 'b.md'));
    const r = await runEmbed(dir, { embedder: stub, model: 'stub' });
    expect(r.removed).toBe(1);
    expect(r.total).toBe(1);
  });
});
