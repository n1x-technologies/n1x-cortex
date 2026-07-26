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

  // ---- near-miss hit rate ----
  const sysResult = over => ({
    name: 's', recallAt5: 1, nearMissHitRateAt5: 1, medianTokens: 100, errors: [], ...over,
  });
  const sysBase = over => ({ recallAt5: 1, nearMissHitRateAt5: 1, medianTokens: 100, ...over });

  it('fails when the near-miss hit rate falls past the limit', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: 0.9 }) } },
      { perSystem: { s: sysBase() } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/near-miss hit rate fell 10\.0 points/);
  });

  // The threshold is pinned from BOTH sides. Asserting only that a large drop
  // fails and a tiny one passes leaves the whole band between them free: the
  // limit could be loosened several-fold and every test would still be green.
  //
  // 1.9 and 2.1 points rather than a clean 2.0 boundary, because binary
  // floating point puts `1 - 0.98` at 0.020000000000000018 — a drop of exactly
  // the limit lands on whichever side the representation error falls. Pinning
  // to within 0.2 points is the tightest assertion that is actually about the
  // threshold rather than about IEEE 754.
  it('pins the near-miss threshold from both sides: 1.9 points passes, 2.1 fails', () => {
    const within = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: 0.981 }) } },
      { perSystem: { s: sysBase() } },
    );
    expect(within.pass).toBe(true);

    const past = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: 0.979 }) } },
      { perSystem: { s: sysBase() } },
    );
    expect(past.pass).toBe(false);
  });

  it('does not fail when the near-miss hit rate RISES', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: 1 }) } },
      { perSystem: { s: sysBase({ nearMissHitRateAt5: 0.5 }) } },
    );
    expect(r.pass).toBe(true);
  });

  it('skips the near-miss hit rate when the baseline recorded null', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: null }) } },
      { perSystem: { s: sysBase({ nearMissHitRateAt5: null }) } },
    );
    expect(r.pass).toBe(true);
  });

  it('skips the near-miss hit rate for a baseline written before the metric existed', () => {
    // An older baseline.json has no nearMissHitRateAt5 key at all. That must
    // not fail the whole gate — the system's other thresholds still apply.
    const r = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: 0.5 }) } },
      { perSystem: { s: { recallAt5: 1, medianTokens: 100 } } },
    );
    expect(r.pass).toBe(true);
  });

  it('fails when a system with a real near-miss baseline reports null', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: null }) } },
      { perSystem: { s: sysBase({ nearMissHitRateAt5: 0.9 }) } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/near-miss hit rate is null but baseline expected a number/);
  });

  // ---- question mix vs cost ----
  // medianTokens is a median over every question asked, so the question set is
  // half of what it measures. Adding four traps to the CI fixture moved cortex
  // 982 -> 809 with no code change; traps that happened to be dearer would have
  // failed CI as a 12% cost regression that never happened.
  const mixed = (ranking, nearMiss, cost) => ({ ranking, nearMiss, cost });

  it('reports a changed question set instead of blaming the system for cost', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ scoredRanking: 15, scoredNearMiss: 6, scoredCost: 21, medianTokens: 200 }) } },
      { perSystem: { s: sysBase({ questionMix: mixed(15, 4, 19), medianTokens: 100 }) } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/question set changed.*15\/4\/19 -> 15\/6\/21/s);
    // The token check is skipped, not merely accompanied: a doubled median must
    // not also be reported as a cost regression on a set that is not comparable.
    expect(r.failures.join('\n')).not.toMatch(/median tokens rose/);
  });

  it('still checks cost when the question set is unchanged', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ scoredRanking: 15, scoredNearMiss: 4, scoredCost: 19, medianTokens: 200 }) } },
      { perSystem: { s: sysBase({ questionMix: mixed(15, 4, 19), medianTokens: 100 }) } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/median tokens rose 100\.0%/);
  });

  it('passes an unchanged question set with unchanged cost', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ scoredRanking: 15, scoredNearMiss: 4, scoredCost: 19, medianTokens: 100 }) } },
      { perSystem: { s: sysBase({ questionMix: mixed(15, 4, 19) }) } },
    );
    expect(r.pass).toBe(true);
  });

  it('skips the mix check for a baseline written before it existed', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ scoredRanking: 1, scoredNearMiss: 1, scoredCost: 2 }) } },
      { perSystem: { s: sysBase() } },  // no questionMix key
    );
    expect(r.pass).toBe(true);
  });

  // A results object that has STOPPED emitting the key is not the same as one
  // reporting null, and it must not fall through to `base - undefined` -> NaN,
  // where every comparison is false and the gate silently stops checking.
  it('fails when the current results omit the near-miss key entirely', () => {
    const cur = sysResult();
    delete cur.nearMissHitRateAt5;
    const r = checkGate(
      { perSystem: { s: cur } },
      { perSystem: { s: sysBase({ nearMissHitRateAt5: 0.9 }) } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/near-miss hit rate is null but baseline expected a number/);
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
