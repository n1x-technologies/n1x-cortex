import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkGate, checkCacheCompleteness } from '../lib/gate.mjs';

const baseline = {
  perSystem: {
    cortex: { recallAt5: 0.9, medianTokens: 1000 },
  },
};
const results = (recallAt5, medianTokens) => ({
  perSystem: { cortex: { name: 'cortex', recallAt5, medianTokens, errors: [] } },
});

describe('checkGate', () => {
  it('passes when nothing moved', () => {
    expect(checkGate(results(0.9, 1000), baseline).pass).toBe(true);
  });

  it('passes on improvement', () => {
    expect(checkGate(results(0.95, 800), baseline).pass).toBe(true);
  });

  it('tolerates a drop within 2 points', () => {
    expect(checkGate(results(0.885, 1000), baseline).pass).toBe(true);
  });

  it('fails on a recall drop beyond 2 points', () => {
    const r = checkGate(results(0.87, 1000), baseline);
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toMatch(/recall@5/);
  });

  it('tolerates a token rise within 10%', () => {
    expect(checkGate(results(0.9, 1100), baseline).pass).toBe(true);
  });

  it('fails on a token rise beyond 10%', () => {
    const r = checkGate(results(0.9, 1101), baseline);
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toMatch(/tokens/);
  });

  it('fails when a baselined system is missing from the results', () => {
    const r = checkGate({ perSystem: {} }, baseline);
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toMatch(/cortex/);
  });

  it('fails when any system errored on any question', () => {
    const r = checkGate(
      { perSystem: { cortex: { name: 'cortex', recallAt5: 0.9, medianTokens: 1000, errors: [{ id: 'q1', message: 'boom' }] } } },
      baseline,
    );
    expect(r.pass).toBe(false);
    expect(r.failures.some(f => /error/i.test(f))).toBe(true);
  });

  it('reports every failure, not just the first', () => {
    const r = checkGate(results(0.5, 5000), baseline);
    expect(r.failures.length).toBe(2);
  });

  // Resolution (task 15 review, Finding 2): full-context.mjs declares
  // `ranks: false`, so its baseline recallAt5 is null (Stage A never
  // computed a ranking for it). The gate must not treat that null as a
  // "recall dropped to nothing" failure -- there is no threshold to check
  // for a system that never claimed to rank.
  it('skips the recall@5 threshold when baseline recall is null (a declared non-ranking system)', () => {
    const nonRankingBaseline = {
      perSystem: { 'full-context': { recallAt5: null, medianTokens: 1000 } },
    };
    const r = checkGate(
      { perSystem: { 'full-context': { name: 'full-context', recallAt5: null, medianTokens: 1000, errors: [] } } },
      nonRankingBaseline,
    );
    expect(r.pass).toBe(true);
  });

  // The other half of the same fix: a null recall must be a skip ONLY when
  // the system declared itself non-ranking (null in the baseline too). If a
  // system whose baseline recall was a real number suddenly reports null,
  // that is a regression -- e.g. a bug that stopped computing citedPaths --
  // and must still fail the gate, not be silently waved through by the same
  // null-handling that legitimately exempts full-context.
  // FIX 2 (Important): checkGate only ever iterated baseline.perSystem, so a
  // system present in results but absent from baseline was never checked at
  // all. That is the one route by which the gate can pass when it should
  // fail (e.g. a --systems-scoped --update-baseline permanently narrows
  // baseline coverage; or a system newly added to STAGE_A_DEFAULT_SYSTEMS
  // ships ungated until someone re-baselines).
  it('fails when a system in results has no baseline entry, naming it and pointing at --update-baseline', () => {
    const r = checkGate(
      {
        perSystem: {
          cortex: { name: 'cortex', recallAt5: 0.9, medianTokens: 1000, errors: [] },
          'naive-rag': { name: 'naive-rag', recallAt5: 0.9, medianTokens: 1000, errors: [] },
        },
      },
      baseline, // baseline only has an entry for 'cortex'
    );
    expect(r.pass).toBe(false);
    expect(r.failures.some(f => /naive-rag/.test(f) && /baseline/.test(f))).toBe(true);
    expect(r.failures.some(f => /--update-baseline/.test(f))).toBe(true);
  });

  it('fails when a ranking system (non-null baseline) reports a null recall@5', () => {
    const r = checkGate(
      { perSystem: { cortex: { name: 'cortex', recallAt5: null, medianTokens: 1000, errors: [] } } },
      baseline, // baseline.cortex.recallAt5 = 0.9, a real number
    );
    expect(r.pass).toBe(false);
    expect(r.failures.some(f => /recall@5 is null/i.test(f))).toBe(true);
  });
});

describe('checkCacheCompleteness', () => {
  let dir, cachePath;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const questions = [
    { id: 'q1', question: 'What is the house target development time ratio?' },
    { id: 'q2', question: 'At what temperature does first crack occur?' },
  ];

  function writeCache(vectors) {
    dir = mkdtempSync(join(tmpdir(), 'gate-cache-'));
    cachePath = join(dir, 'query-vectors.json');
    writeFileSync(cachePath, JSON.stringify({ model: 'm', dim: 3, vectors }));
    return cachePath;
  }

  it('returns no failures when every question has a cached vector', () => {
    const p = writeCache({
      'What is the house target development time ratio?': [1, 0, 0],
      'At what temperature does first crack occur?': [0, 1, 0],
    });
    expect(checkCacheCompleteness(questions, p)).toEqual([]);
  });

  it('matches cache keys that carry a query:/passage: prefix', () => {
    const p = writeCache({
      'query: What is the house target development time ratio?': [1, 0, 0],
      'passage: At what temperature does first crack occur?': [0, 1, 0],
    });
    expect(checkCacheCompleteness(questions, p)).toEqual([]);
  });

  it('reports a failure naming the missing question when a vector is absent', () => {
    const p = writeCache({
      'What is the house target development time ratio?': [1, 0, 0],
    });
    const failures = checkCacheCompleteness(questions, p);
    expect(failures.length).toBe(1);
    expect(failures[0]).toMatch(/q2/);
    expect(failures[0]).toMatch(/At what temperature does first crack occur\?/);
    expect(failures[0]).toMatch(/build-fixture-embeddings\.mjs/);
  });

  it('reports one failure per missing question, not just the first', () => {
    const p = writeCache({});
    const failures = checkCacheCompleteness(questions, p);
    expect(failures.length).toBe(2);
  });
});
