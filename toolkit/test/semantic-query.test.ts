import { describe, it, expect } from 'vitest';
import { semanticQueryRanking } from '../src/semantic/queryRank.js';
import { runEmbed } from '../src/commands/embed.js';
import { loadConfig } from '../src/config.js';
import { scanVault, collectFrontmatterKeys } from '../src/vault.js';
import type { Embedder } from '../src/semantic/embedder.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stub: Embedder = {
  id: 'stub', dim: 3,
  async embed(texts) { return texts.map(t => Float32Array.from(t.includes('alpha') ? [1, 0, 0] : [0, 1, 0])); },
};

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-sq-'));
  mkdirSync(join(dir, 'N'));
  writeFileSync(join(dir, 'N', 'a.md'), '# A\n\nalpha topic');
  writeFileSync(join(dir, 'N', 'b.md'), '# B\n\nbeta topic');
  return dir;
}

describe('semanticQueryRanking', () => {
  it('returns [] when no store exists (graceful degradation)', async () => {
    const dir = vault();
    const config = loadConfig(dir, collectFrontmatterKeys(dir));
    const notes = scanVault(dir, config);
    expect(await semanticQueryRanking(dir, config, notes, 'beta', stub)).toEqual([]);
  });

  it('ranks the semantically closest note first', async () => {
    const dir = vault();
    // build a store whose model matches config.embedModel so the ranking activates
    const config = loadConfig(dir, collectFrontmatterKeys(dir));
    await runEmbed(dir, { embedder: stub, model: config.embedModel });
    const notes = scanVault(dir, config);
    const ranking = await semanticQueryRanking(dir, config, notes, 'beta query', stub);
    expect(ranking[0]).toBe('b'); // query "beta" -> [0,1,0] -> closest to note b (basename of b.md)
  });
});
