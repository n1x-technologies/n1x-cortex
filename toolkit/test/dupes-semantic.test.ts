import { describe, it, expect } from 'vitest';
import { computeDupes } from '../src/curate/dupes.js';
import { runEmbed } from '../src/commands/embed.js';
import { loadConfig } from '../src/config.js';
import type { Embedder } from '../src/semantic/embedder.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// stub returns the SAME vector for every note -> cosine 1.0 between any pair
const stub: Embedder = { id: 'stub', dim: 3, async embed(texts) { return texts.map(() => Float32Array.from([1, 0, 0])); } };

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-dsem-'));
  mkdirSync(join(dir, 'N'));
  // lexically disjoint (no shared tokens) but semantically identical per the stub
  writeFileSync(join(dir, 'N', 'es.md'), '# Silencio\n\nEl acusado renuncio a guardar silencio durante interrogatorio.');
  writeFileSync(join(dir, 'N', 'en.md'), '# Miranda\n\nDefendant waived Fifth Amendment protections before questioning.');
  return dir;
}

describe('computeDupes semantic', () => {
  it('surfaces a semantic-only pair that TF-IDF misses', async () => {
    const dir = vault();
    const config = loadConfig(dir, []);
    await runEmbed(dir, { embedder: stub, model: config.embedModel });
    const pairs = computeDupes(dir, config, config.dupeThreshold);
    expect(pairs.length).toBe(1);
    expect(pairs[0].via).toBe('semantic');
    expect(pairs[0].semantic).toBeGreaterThanOrEqual(config.semanticDupeThreshold);
    expect(pairs[0].lexical).toBe(0);
  });

  it('without a store, behaves exactly as the lexical engine (no pairs here)', () => {
    const dir = vault();
    const config = loadConfig(dir, []);
    expect(computeDupes(dir, config, config.dupeThreshold).length).toBe(0);
  });
});
