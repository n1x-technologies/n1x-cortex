import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCachedEmbedder } from '../lib/fixture-embedder.mjs';
import * as hybrid from '../lib/systems/cortex.mjs';
import * as lexical from '../lib/systems/cortex-lexical.mjs';
import * as semantic from '../lib/systems/cortex-semantic.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(here, '../fixtures/ci-vault');
const ctx = () => ({
  vaultDir: VAULT,
  embedder: createCachedEmbedder(resolve(here, '../fixtures/query-vectors.json')),
});

const Q = 'At what temperature does first crack occur?';

describe.each([
  ['cortex', hybrid],
  ['cortex-lexical', lexical],
  ['cortex-semantic', semantic],
])('%s conforms to the system contract', (label, sys) => {
  it('exports a name matching its label', () => {
    expect(sys.name).toBe(label);
  });

  it('returns all four contract fields', async () => {
    const r = await sys.run(Q, ctx());
    expect(typeof r.promptPayload).toBe('string');
    expect(Array.isArray(r.citedPaths)).toBe(true);
    expect(typeof r.latencyMs).toBe('number');
    expect(r.retrievalTokens).toBe(0); // one-shot retrievers spend no LLM tokens
  });

  it('returns vault-relative cited paths, not absolute ones', async () => {
    const r = await sys.run(Q, ctx());
    expect(r.citedPaths.length).toBeGreaterThan(0);
    for (const p of r.citedPaths) {
      expect(p.startsWith('/')).toBe(false);
      expect(p.endsWith('.md')).toBe(true);
    }
  });

  it('finds the gold note for a direct factual question', async () => {
    const r = await sys.run(Q, ctx());
    expect(r.citedPaths.slice(0, 5)).toContain('notes/first-crack.md');
  });

  it('produces a payload containing the answer text', async () => {
    const r = await sys.run(Q, ctx());
    expect(r.promptPayload).toMatch(/196/);
  });
});

describe('cortex-lexical', () => {
  it('needs no embedder at all', async () => {
    const r = await lexical.run(Q, { vaultDir: VAULT });
    expect(r.citedPaths.length).toBeGreaterThan(0);
  });
});
