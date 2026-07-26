// The CI gate. Thresholds are absolute for recall (points) and relative for
// cost (percent), because a small recall move matters more than a small token
// move. Errors are always fatal: a system that throws is not a passing system.
import { readFileSync } from 'node:fs';
import { normalise } from './fixture-embedder.mjs';

export const RECALL_DROP_LIMIT = 0.02; // 2 points
export const TOKEN_RISE_LIMIT = 0.10;  // 10%

// The near-miss hit rate gets its own constant even though it currently holds
// the same value, because the two thresholds do NOT behave the same way and
// writing "same threshold as recall@5" would be a false reassurance.
//
// nearMissHitRateAt5 is a mean of per-trap 0/1 values, so its resolution is
// 1/nTraps. On the committed 4-trap fixture the smallest possible move is 25
// points — twelve times this limit — which means the limit cannot bind and any
// single trap flipping from tempted to not-tempted fails the gate. That is the
// intended behaviour at this fixture size: on four traps there is no such
// thing as a drop small enough to be noise. The threshold is here for a larger
// trap set, where a hit rate can move by less than a whole question.
export const NEAR_MISS_DROP_LIMIT = 0.02; // 2 points

/**
 * @param {{perSystem: Record<string, {name, recallAt5, medianTokens, errors}>}} results
 * @param {{perSystem: Record<string, {recallAt5, medianTokens}>}} baseline
 * @returns {{pass: boolean, failures: string[]}}
 */
export function checkGate(results, baseline) {
  const failures = [];

  // A system present in results but absent from baseline is otherwise never
  // checked at all: the loop below only iterates baseline's entries. That is
  // the one route by which the gate can pass when it should fail — e.g.
  // `--update-baseline --systems cortex` narrows baseline.perSystem to one
  // system, and every later run silently stops gating the other four. Any
  // such system must fail loudly, pointing at the fix (a full re-baseline),
  // rather than being invisible to the gate.
  for (const name of Object.keys(results.perSystem)) {
    if (!Object.prototype.hasOwnProperty.call(baseline.perSystem, name)) {
      failures.push(
        `${name}: present in results but missing from baseline — the gate is not ` +
          'checking this system. Re-baseline WITHOUT --systems so every system is ' +
          'covered: node bench/run.mjs --stage a --corpus fixtures --update-baseline 1',
      );
    }
  }

  for (const [name, base] of Object.entries(baseline.perSystem)) {
    const cur = results.perSystem[name];
    if (!cur) {
      failures.push(`${name}: present in baseline but missing from results`);
      continue;
    }

    // A null baseline recall means the system was ALREADY declared
    // non-ranking (e.g. full-context.mjs's `ranks = false`) when the
    // baseline was captured — there is no threshold to check, by design, and
    // that is not a gap in the gate. But if the BASELINE recall is a real
    // number (the system used to rank) and the CURRENT recall has become
    // null, that is a system that stopped reporting a ranking metric it
    // used to report — a regression the gate must still catch, not a
    // declaration it can wave through.
    if (base.recallAt5 === null || base.recallAt5 === undefined) {
      // Nothing to compare: declared non-ranking, skip.
    } else if (!measured(cur.recallAt5)) {
      failures.push(
        `${name}: recall@5 is ${describe(cur.recallAt5)} but baseline expected a number ` +
        `(${base.recallAt5.toFixed(3)}) — a ranking system stopped reporting a ranking metric`,
      );
    } else {
      const recallDrop = base.recallAt5 - cur.recallAt5;
      if (recallDrop > RECALL_DROP_LIMIT) {
        failures.push(
          `${name}: recall@5 fell ${(recallDrop * 100).toFixed(1)} points ` +
          `(${base.recallAt5.toFixed(3)} -> ${cur.recallAt5.toFixed(3)}), limit ${RECALL_DROP_LIMIT * 100} points`,
        );
      }
    }

    // Same null/undefined rule as recall@5 (see NEAR_MISS_DROP_LIMIT for why
    // the threshold itself is NOT the same in effect). A null or absent key in
    // the BASELINE means the metric never applied when the baseline was
    // captured — a non-ranking system, a dataset with no trap questions, or a
    // baseline written before this metric existed — so there is nothing to
    // compare and the system's other thresholds still apply. A null that
    // appears only in the CURRENT run is a system that stopped reporting a
    // metric it used to report, which is a regression to catch.
    if (base.nearMissHitRateAt5 === undefined || base.nearMissHitRateAt5 === null) {
      // Nothing to compare.
    } else if (!measured(cur.nearMissHitRateAt5)) {
      failures.push(
        `${name}: near-miss hit rate is ${describe(cur.nearMissHitRateAt5)} but baseline expected a number ` +
        `(${base.nearMissHitRateAt5.toFixed(3)}) — a system stopped reporting a metric it used to report`,
      );
    } else {
      const nearMissDrop = base.nearMissHitRateAt5 - cur.nearMissHitRateAt5;
      if (nearMissDrop > NEAR_MISS_DROP_LIMIT) {
        failures.push(
          `${name}: near-miss hit rate fell ${(nearMissDrop * 100).toFixed(1)} points ` +
          `(${base.nearMissHitRateAt5.toFixed(3)} -> ${cur.nearMissHitRateAt5.toFixed(3)}), ` +
          `limit ${NEAR_MISS_DROP_LIMIT * 100} points`,
        );
      }
    }

    // medianTokens is a median over EVERY question asked, answerable and trap
    // alike (scoring traps for cost is deliberate — a trap costs a real
    // retrieval). That makes it a property of the system AND of the question
    // set, not of the system alone. Adding four traps to this fixture moved
    // cortex from 982 to 809 with no code change; traps that happened to be
    // more expensive would have produced "median tokens rose 12.0%, limit 10%"
    // and blamed a cost regression that never happened.
    //
    // So the mix is compared first. If it changed, the token comparison is not
    // wrong so much as meaningless, and reporting it would tell the operator a
    // false story about their retrieval change. Fail pointing at the dataset
    // and skip the cost check. An absent baseline mix means a baseline written
    // before this guard existed — nothing to compare, same rule as the
    // near-miss key.
    const mixChanged =
      base.questionMix !== undefined && !sameMix(base.questionMix, curMix(cur));
    if (mixChanged) {
      failures.push(
        `${name}: the question set changed since the baseline ` +
        `(ranking/near-miss/cost ${fmtMix(base.questionMix)} -> ${fmtMix(curMix(cur))}). ` +
        'medianTokens is a median over every question asked, so this moves it ' +
        'independently of retrieval cost — the cost check is skipped rather than ' +
        'blamed on the system. Re-baseline: ' +
        'node bench/run.mjs --stage a --corpus fixtures --update-baseline 1',
      );
    } else if (!measured(cur.medianTokens)) {
      failures.push(
        `${name}: medianTokens is ${describe(cur.medianTokens)} but baseline expected a number ` +
        `(${base.medianTokens}) — the cost check cannot run`,
      );
    } else {
      const tokenRise = (cur.medianTokens - base.medianTokens) / base.medianTokens;
      if (tokenRise > TOKEN_RISE_LIMIT) {
        failures.push(
          `${name}: median tokens rose ${(tokenRise * 100).toFixed(1)}% ` +
          `(${base.medianTokens} -> ${cur.medianTokens}), limit ${TOKEN_RISE_LIMIT * 100}%`,
        );
      }
    }

    if (cur.errors?.length) {
      failures.push(`${name}: errored on ${cur.errors.length} question(s): ${cur.errors.map(e => e.id).join(', ')}`);
    }
  }

  return { pass: failures.length === 0, failures };
}

/**
 * A metric the gate can actually compare against a threshold.
 *
 * Every comparison here is `drop > LIMIT`, and every comparison against NaN is
 * false — so a NaN, an absent key, or a string from a hand-edited results.json
 * made the gate PASS in silence, which is the one behaviour a regression gate
 * must never have. A non-number also used to reach `.toFixed()` and throw,
 * crashing the run instead of reporting a failure.
 *
 * `null` is deliberately NOT measured: it means "not applicable" (a
 * non-ranking system, a dataset with no traps) and is handled by the
 * baseline-side checks above before this is ever consulted.
 */
const measured = v => typeof v === 'number' && Number.isFinite(v);

const describe = v =>
  v === undefined ? 'missing' : v === null ? 'null' : Number.isNaN(v) ? 'NaN' : JSON.stringify(v);

/** The three denominators runStageA already publishes next to every rate. */
const curMix = s => ({
  ranking: s.scoredRanking,
  nearMiss: s.scoredNearMiss,
  cost: s.scoredCost,
});

const sameMix = (a, b) =>
  a.ranking === b.ranking && a.nearMiss === b.nearMiss && a.cost === b.cost;

const fmtMix = m => `${m.ranking}/${m.nearMiss}/${m.cost}`;

/**
 * Guards against silent degradation: Cortex's semanticQueryRanking swallows
 * embedder errors and returns [], so a stale/incomplete query-vector cache
 * makes the semantic path fall back to lexical-only retrieval with no
 * thrown error and (on this fixture, where every system already scores
 * recall@5 = 1.000) no visible recall drop either. The only way to catch
 * that is to check the cache directly, before it has a chance to fail quietly.
 *
 * Uses the same key-normalisation rule as the embedder itself
 * (`fixture-embedder.mjs`'s `normalise`) so a `query: `/`passage: ` prefix on
 * either side of the comparison never produces a false failure.
 *
 * @param {{id: string, question: string}[]} questions
 * @param {string} cachePath  JSON: { model, dim, vectors: { [text]: number[] } }
 * @returns {string[]} failure messages, one per question missing a cached vector
 */
export function checkCacheCompleteness(questions, cachePath) {
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  const cached = new Set(Object.keys(cache.vectors).map(normalise));

  const failures = [];
  for (const q of questions) {
    if (!cached.has(normalise(q.question))) {
      failures.push(
        `${q.id}: no cached query vector for "${q.question}" in ${cachePath}. ` +
        `Re-run: node bench/scripts/build-fixture-embeddings.mjs`,
      );
    }
  }
  return failures;
}
