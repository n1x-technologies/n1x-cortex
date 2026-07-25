import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCachedEmbedder } from '../lib/fixture-embedder.mjs';
import { loadDataset } from '../lib/dataset.mjs';
import * as hybrid from '../lib/systems/cortex.mjs';
import * as lexical from '../lib/systems/cortex-lexical.mjs';
import * as semantic from '../lib/systems/cortex-semantic.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(here, '../fixtures/ci-vault');
const QUESTIONS_PATH = resolve(here, '../fixtures/ci-questions.jsonl');
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

// The per-system tests above are all "does this system work", not "are these
// three systems actually different". Every one of them would still pass if
// cortex-semantic were reimplemented as a call-through to cortex-lexical: on
// this 12-note fixture the gold note ranks #1 for every question under every
// system, so recall/rank assertions are at ceiling and can't detect a
// collapsed ablation. These tests assert on disagreement instead.
describe('ablations are not degenerate copies of one another', () => {
  it('cortex-semantic and cortex-lexical do not return identical rankings for the shared fixture question', async () => {
    const [lex, sem] = await Promise.all([
      lexical.run(Q, ctx()),
      semantic.run(Q, ctx()),
    ]);
    expect(sem.citedPaths).not.toEqual(lex.citedPaths);
  });

  it('cortex-semantic and cortex-lexical disagree on most questions in the fixture set', async () => {
    const questions = loadDataset(QUESTIONS_PATH, VAULT);

    let disagreements = 0;
    for (const q of questions) {
      const [lex, sem] = await Promise.all([
        lexical.run(q.question, ctx()),
        semantic.run(q.question, ctx()),
      ]);
      if (JSON.stringify(lex.citedPaths) !== JSON.stringify(sem.citedPaths)) {
        disagreements++;
      }
    }

    // Measured against this fixture set: lexical == semantic on 0 of 15
    // questions (vs. hybrid == lexical on 1 of 15, which is legitimate —
    // the hybrid fusion can land on the same ranking as its lexical input
    // when semantic re-ranking doesn't move anything). A collapsed ablation
    // (semantic delegating to lexical, or vice versa) would score 0 here, so
    // "more than half" is a threshold the real implementation clears with
    // wide margin without being tight enough to flake on an incidental
    // tie-break. Do not raise this threshold toward the observed 15/15
    // without re-measuring — it should track what the data supports, not
    // the current best case.
    expect(disagreements).toBeGreaterThan(questions.length / 2);
  });
});
