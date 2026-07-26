// The CI gate. Thresholds are absolute for recall (points) and relative for
// cost (percent), because a small recall move matters more than a small token
// move. Errors are always fatal: a system that throws is not a passing system.
import { readFileSync } from 'node:fs';
import { normalise } from './fixture-embedder.mjs';

export const RECALL_DROP_LIMIT = 0.02; // 2 points
export const TOKEN_RISE_LIMIT = 0.10;  // 10%

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
    if (base.recallAt5 === null) {
      // Nothing to compare: declared non-ranking, skip.
    } else if (cur.recallAt5 === null) {
      failures.push(
        `${name}: recall@5 is null but baseline expected a number ` +
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

    const tokenRise = (cur.medianTokens - base.medianTokens) / base.medianTokens;
    if (tokenRise > TOKEN_RISE_LIMIT) {
      failures.push(
        `${name}: median tokens rose ${(tokenRise * 100).toFixed(1)}% ` +
        `(${base.medianTokens} -> ${cur.medianTokens}), limit ${TOKEN_RISE_LIMIT * 100}%`,
      );
    }

    if (cur.errors?.length) {
      failures.push(`${name}: errored on ${cur.errors.length} question(s): ${cur.errors.map(e => e.id).join(', ')}`);
    }
  }

  return { pass: failures.length === 0, failures };
}

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
