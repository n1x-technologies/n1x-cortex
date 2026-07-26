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

    // The baseline side needs the same distrust as the results side, and for a
    // sharper reason: every check below is guarded by a `base.X === undefined`
    // test that means "nothing to compare", so an ABSENT baseline key silently
    // turns that check off. `base.medianTokens` was worse — it reached no
    // presence test at all, and `(cur - undefined) / undefined` is NaN, which
    // fails every comparison.
    //
    // Demonstrated end to end: strip the three metrics from one system's
    // baseline entry, break its retriever so recall@5 is 0.000, and the gate
    // printed "bench gate passed". The rename in this very commit range is how
    // that happens in practice — update run.mjs and gate.mjs, forget
    // baseline.json, and the check evaporates without a word.
    //
    // So absence is a failure and `null` stays legal, because null is the
    // meaningful value ("not applicable", a declared non-ranking system).
    // There is deliberately no backward-compatible skip for a baseline written
    // before a metric existed: regenerating is one command, and an old
    // baseline that silently gates less is exactly what this catches.
    //
    // PRESENCE IS NOT ENOUGH, and checking only presence was the first version
    // of this guard. `"n/a"` or `{}` in a baseline satisfies a `!== undefined`
    // test and then NaNs out every `drop > LIMIT` below, which is the same
    // silent pass by a different route: setting the three metrics to `"n/a"`
    // and breaking a retriever printed "bench gate passed" exactly as the
    // absent-key version did. A non-number also reaches `.toFixed()` in the
    // failure messages and crashes the run. So a baseline value must be null
    // or a finite number, the same bar the results side already had to clear.
    if (base === null || typeof base !== 'object') {
      failures.push(
        `${name}: baseline entry is ${describe(base)}, not an object. Re-baseline: ` +
          'node bench/run.mjs --stage a --corpus fixtures --update-baseline 1',
      );
      continue;
    }
    const badKeys = ['recallAt5', 'nearMissHitRateAt5', 'medianTokens']
      .filter(k => !(base[k] === null || measured(base[k])))
      .concat(base.questionMix === undefined || !validMix(base.questionMix) ? ['questionMix'] : []);
    if (badKeys.length) {
      failures.push(
        `${name}: baseline entry has unusable ${badKeys.join(', ')} ` +
          `(${badKeys.map(k => `${k}=${describe(base[k])}`).join(', ')}) — a key that is ` +
          'absent or not a number silently disables that check rather than comparing it. ' +
          'Re-baseline: node bench/run.mjs --stage a --corpus fixtures --update-baseline 1',
      );
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
    // and skip the cost check. The BASELINE mix is already known valid — the
    // shape check above rejected anything else — so only the results side can
    // be unusable here, and that is a different failure with a different fix.
    if (!validMix(curMix(cur))) {
      failures.push(
        `${name}: results carry no usable question-mix denominators ` +
        `(scoredRanking/scoredNearMiss/scoredCost = ${fmtMix(curMix(cur))}) — ` +
        'the cost check cannot tell a dataset change from a cost regression without them. ' +
        'This is a results-side problem: re-baselining will not fix it.',
      );
    } else if (!sameMix(base.questionMix, curMix(cur))) {
      // The cost number is still REPORTED, just not blamed. Withholding it
      // entirely opened a laundering path: a PR that adds trap questions AND
      // regresses cost fails once on the mix, gets re-baselined per the
      // instruction in this very message, and ships the regression unmeasured.
      // (This branch is itself "a PR that adds trap questions".) Whoever
      // re-baselines needs to see what they are accepting.
      const rise = measured(cur.medianTokens) && measured(base.medianTokens) && base.medianTokens
        ? ` For reference, median tokens moved ${(((cur.medianTokens - base.medianTokens) / base.medianTokens) * 100).toFixed(1)}% ` +
          `(${base.medianTokens} -> ${cur.medianTokens}) across the two different question sets; ` +
          'check that before accepting it as the new baseline.'
        : '';
      failures.push(
        `${name}: the question set changed since the baseline ` +
        `(ranking/near-miss/cost ${fmtMix(base.questionMix)} -> ${fmtMix(curMix(cur))}). ` +
        'medianTokens is a median over every question asked, so this moves it ' +
        'independently of retrieval cost — the cost threshold is not applied to a ' +
        `set it cannot compare.${rise} Re-baseline: ` +
        'node bench/run.mjs --stage a --corpus fixtures --update-baseline 1',
      );
    } else if (base.medianTokens === null) {
      // Same "not applicable" rule the two ranking metrics follow. The shape
      // check declares null legal, so the comparison must handle it: dividing
      // by it produced `median tokens rose Infinity%` against a real current
      // value, and `0/0 = NaN` — which passes — against a current 0.
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

    // Not `cur.errors?.length`: an omitted, null or non-array `errors` was
    // waved through by the optional chain, and a string threw a raw TypeError
    // out of `.map`. Same threat model as measured() — a hand-edited
    // results.json must fail the gate, not disable a check or crash it.
    if (!Array.isArray(cur.errors)) {
      failures.push(
        `${name}: results carry no errors array (${describe(cur.errors)}) — the gate ` +
          'cannot confirm the system ran without errors',
      );
    } else if (cur.errors.length) {
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

// Compared as numbers, not with ===. A baseline round-tripped through a tool
// that stringifies would otherwise fail with "the question set changed
// (15/4/19 -> 15/4/19)" — identical values on both sides of the arrow, which
// tells the reader nothing and looks like a bug in the gate.
/**
 * A mix is usable only if all three denominators are finite numbers. Coercing
 * blindly meant a results object that stopped emitting them compared
 * `Number(undefined)` — NaN, never equal to itself — and the gate failed with
 * `15/4/19 -> undefined/undefined/undefined`. Following the "re-baseline"
 * remedy in that message then wrote `questionMix: {}` (JSON.stringify drops
 * undefined members), and the NEXT run failed with
 * `undefined/undefined/undefined -> undefined/undefined/undefined`: the exact
 * x -> x pathology the numeric comparison was added to remove, made permanent
 * by the one action the message recommends.
 */
const validMix = m =>
  m !== null && typeof m === 'object' &&
  ['ranking', 'nearMiss', 'cost'].every(k => measured(Number(m[k])) && m[k] !== null && m[k] !== '');

const sameMix = (a, b) =>
  Number(a.ranking) === Number(b.ranking) &&
  Number(a.nearMiss) === Number(b.nearMiss) &&
  Number(a.cost) === Number(b.cost);

const fmtMix = m =>
  !validMix(m) ? 'not recorded' : `${m.ranking}/${m.nearMiss}/${m.cost}`;

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
 * Covers BOTH populations in the file. It used to check only the question
 * vectors, while the same cache also holds one `passage: ` vector per naive-rag
 * chunk — half the artifact, guarded by a docstring that claimed completeness.
 * A missing chunk vector fails loudly today (`fixture-embedder.mjs` throws, the
 * errors check catches it), so this was a coverage gap rather than a live hole;
 * but "it happens to fail somewhere else" is exactly the reasoning that leaves
 * a guard inert when the thing downstream changes.
 *
 * `chunkTexts` is optional so a caller with no vault handy still gets the
 * question half, rather than the check silently becoming all-or-nothing.
 *
 * @param {{id: string, question: string}[]} questions
 * @param {string} cachePath  JSON: { model, dim, vectors: { [text]: number[] } }
 * @param {string[]} [chunkTexts]  naive-rag chunk bodies, cached as `passage: <text>`
 * @returns {string[]} failure messages, one per missing vector
 */
export function checkCacheCompleteness(questions, cachePath, chunkTexts = []) {
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
  for (const [i, text] of chunkTexts.entries()) {
    if (!cached.has(normalise(text))) {
      failures.push(
        `chunk ${i}: no cached passage vector for "${text.slice(0, 60)}..." in ${cachePath}. ` +
        `Re-run: node bench/scripts/build-fixture-embeddings.mjs`,
      );
    }
  }
  return failures;
}
