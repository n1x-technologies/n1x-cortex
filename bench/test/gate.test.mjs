import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkGate, checkCacheCompleteness } from '../lib/gate.mjs';

const baseline = {
  perSystem: {
    cortex: {
      recallAt5: 0.9,
      nearMissHitRateAt5: null,
      medianTokens: 1000,
      questionMix: { ranking: 15, nearMiss: 0, cost: 15 },
    },
  },
};
const results = (recallAt5, medianTokens) => ({
  perSystem: {
    cortex: {
      name: 'cortex', recallAt5, nearMissHitRateAt5: null, medianTokens, errors: [],
      scoredRanking: 15, scoredNearMiss: 0, scoredCost: 15,
    },
  },
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

  // Both sides, tightly. The pair above (0.885 passes, 0.87 fails) leaves the
  // 1.5-3.0-point band free: RECALL_DROP_LIMIT could be loosened from 0.02 to
  // 0.029 — 45% looser — and the whole suite stayed green. The near-miss
  // threshold got this treatment when it was added; the metric it was modelled
  // on never had it.
  //
  // 1.9 and 2.1 points rather than a clean 2.0 boundary, for the same IEEE 754
  // reason as the near-miss pin below.
  it('pins the recall threshold from both sides: 1.9 points passes, 2.1 fails', () => {
    expect(checkGate(results(0.881, 1000), baseline).pass).toBe(true);
    expect(checkGate(results(0.879, 1000), baseline).pass).toBe(false);
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
    // A complete baseline entry: null is the VALUE for a non-ranking system,
    // which is a different thing from the key being absent.
    const nonRankingBaseline = {
      perSystem: {
        'full-context': {
          recallAt5: null, nearMissHitRateAt5: null, medianTokens: 1000,
          questionMix: { ranking: 0, nearMiss: 0, cost: 19 },
        },
      },
    };
    const r = checkGate(
      { perSystem: { 'full-context': {
        name: 'full-context', recallAt5: null, nearMissHitRateAt5: null, medianTokens: 1000,
        errors: [], scoredRanking: 0, scoredNearMiss: 0, scoredCost: 19,
      } } },
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
    name: 's', recallAt5: 1, nearMissHitRateAt5: 1, medianTokens: 100, errors: [],
    scoredRanking: 15, scoredNearMiss: 4, scoredCost: 19, ...over,
  });
  const sysBase = over => ({
    recallAt5: 1, nearMissHitRateAt5: 1, medianTokens: 100,
    questionMix: { ranking: 15, nearMiss: 4, cost: 19 }, ...over,
  });

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

  // Previously this asserted the opposite — that a baseline written before the
  // metric existed should be waved through. That backward-compatible skip IS
  // the hole: it cannot be told apart from a rename that forgot baseline.json,
  // and it silently gates less. Regenerating is one command, so absence fails.
  it('refuses a baseline written before the near-miss metric existed', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: 0.5 }) } },
      { perSystem: { s: { recallAt5: 1, medianTokens: 100 } } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/baseline entry is missing nearMissHitRateAt5, questionMix/);
  });

  it('fails when a system with a real near-miss baseline reports null', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ nearMissHitRateAt5: null }) } },
      { perSystem: { s: sysBase({ nearMissHitRateAt5: 0.9 }) } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/near-miss hit rate is null but baseline expected a number/);
  });

  // ---- the BASELINE side is as untrusted as the results side ----
  // Every check is guarded by a `base.X === undefined` test meaning "nothing to
  // compare", so an absent baseline key silently turned that check OFF. Proved
  // end to end: strip the three metrics from one system's baseline entry, break
  // its retriever so recall@5 is 0.000, and the gate printed "bench gate
  // passed". A rename that updates the code and forgets baseline.json is
  // exactly how it happens.
  it('fails when a baseline entry is missing a metric key', () => {
    for (const key of ['recallAt5', 'nearMissHitRateAt5', 'medianTokens', 'questionMix']) {
      const base = sysBase({ questionMix: mixed(15, 4, 19) });
      delete base[key];
      const r = checkGate(
        { perSystem: { s: sysResult({ scoredRanking: 15, scoredNearMiss: 4, scoredCost: 19 }) } },
        { perSystem: { s: base } },
      );
      expect(r.pass, `baseline missing ${key}`).toBe(false);
      expect(r.failures.join('\n')).toMatch(new RegExp(`baseline entry is missing ${key}`));
    }
  });

  it('still accepts null in a baseline entry — null is a value, absence is not', () => {
    const r = checkGate(
      { perSystem: { s: sysResult({ recallAt5: null, nearMissHitRateAt5: null, scoredRanking: 0, scoredNearMiss: 0, scoredCost: 19 }) } },
      { perSystem: { s: { recallAt5: null, nearMissHitRateAt5: null, medianTokens: 100, questionMix: mixed(0, 0, 19) } } },
    );
    expect(r.pass).toBe(true);
  });

  // ---- a gate that cannot be fooled into passing ----
  // Every comparison here is `drop > LIMIT`, and every comparison against NaN
  // is false, so a NaN or an absent key made the gate pass in silence — the one
  // behaviour a regression gate must never have.
  it('fails rather than passes when a current metric is NaN or missing', () => {
    const cases = [
      ['recallAt5', 'recall@5'],
      ['nearMissHitRateAt5', 'near-miss hit rate'],
      ['medianTokens', 'medianTokens'],
    ];
    for (const [key, label] of cases) {
      const nan = checkGate(
        { perSystem: { s: sysResult({ [key]: NaN }) } },
        { perSystem: { s: sysBase() } },
      );
      expect(nan.pass, `${key} = NaN`).toBe(false);
      expect(nan.failures.join('\n')).toMatch(new RegExp(`${label} is NaN`));

      const cur = sysResult();
      delete cur[key];
      const absent = checkGate({ perSystem: { s: cur } }, { perSystem: { s: sysBase() } });
      expect(absent.pass, `${key} absent`).toBe(false);
      expect(absent.failures.join('\n')).toMatch(new RegExp(`${label} is missing`));
    }
  });

  it('reports a non-numeric metric as a failure instead of throwing', () => {
    // A hand-edited results.json is exactly the input a gate must survive.
    const r = checkGate(
      { perSystem: { s: sysResult({ recallAt5: '0' }) } },
      { perSystem: { s: sysBase() } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/recall@5 is "0"/);
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
    // The cost THRESHOLD is not applied, but the number is still reported.
    // Withholding it opened a laundering path: a PR that changes the question
    // set and regresses cost fails once, gets re-baselined per the instruction
    // in this very message, and ships the regression unmeasured.
    expect(r.failures.join('\n')).not.toMatch(/median tokens rose/);
    expect(r.failures.join('\n')).toMatch(/median tokens moved 100\.0% \(100 -> 200\)/);
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

  it('treats a null questionMix as a changed set, not as nothing to compare', () => {
    const base = sysBase();
    base.questionMix = null;
    const r = checkGate(
      { perSystem: { s: sysResult() } },
      { perSystem: { s: base } },
    );
    expect(r.pass).toBe(false);
    expect(r.failures.join('\n')).toMatch(/question set changed.*none recorded -> 15\/4\/19/s);
  });

  it('compares the mix numerically so the message is never x -> x', () => {
    // A baseline round-tripped through a tool that stringifies must not fail
    // with "the question set changed (15/4/19 -> 15/4/19)".
    const r = checkGate(
      { perSystem: { s: sysResult() } },
      { perSystem: { s: sysBase({ questionMix: { ranking: '15', nearMiss: '4', cost: '19' } }) } },
    );
    expect(r.pass).toBe(true);
  });

  it('fails when results carry no errors array instead of waving it through', () => {
    for (const bad of [undefined, null, 'boom', {}]) {
      const cur = sysResult();
      cur.errors = bad;
      if (bad === undefined) delete cur.errors;
      const r = checkGate({ perSystem: { s: cur } }, { perSystem: { s: sysBase() } });
      expect(r.pass, String(bad)).toBe(false);
      expect(r.failures.join('\n')).toMatch(/results carry no errors array/);
    }
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
    // "missing", not "null" — the two states have different fixes, so the
    // message distinguishes them.
    expect(r.failures.join('\n')).toMatch(/near-miss hit rate is missing but baseline expected a number/);
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
