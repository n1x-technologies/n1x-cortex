// Pure scoring functions. Kept dependency-free and separately tested because a
// silent bug here corrupts every published number without failing anything.

/** Binary-relevance recall@k: what fraction of gold docs appear in the top k. */
export function recallAtK(citedPaths, goldPaths, k) {
  if (!goldPaths.length) return 0;
  const top = new Set(citedPaths.slice(0, k));
  const found = goldPaths.filter(g => top.has(g)).length;
  return found / goldPaths.length;
}

/**
 * Binary hit@k: 1 if ANY target doc appears in the top k, else 0.
 *
 * Deliberately not recall@k. Recall asks "how much of the target set did you
 * retrieve", which is the right question for gold documents — an answer needs
 * all of its supporting notes. It is the wrong question for near-miss notes,
 * where the only thing being measured is whether the system was exposed to the
 * temptation at all. A system that retrieved one of two near-miss notes was
 * tempted exactly as much as one that retrieved both, and scoring it 0.5 both
 * invents a ranking where there is none and makes the number move when an
 * author adds a third near-miss path to a question.
 *
 * An empty target set returns 0 for the same reason recallAtK does: it is a
 * malformed question, not a measurement. dataset.mjs rejects it at load.
 */
export function hitAtK(citedPaths, targetPaths, k) {
  if (!targetPaths.length) return 0;
  const top = new Set(citedPaths.slice(0, k));
  return targetPaths.some(p => top.has(p)) ? 1 : 0;
}

/** Reciprocal rank of the earliest gold hit within k; 0 if none. */
export function reciprocalRank(citedPaths, goldPaths, k) {
  const gold = new Set(goldPaths);
  const top = citedPaths.slice(0, k);
  for (let i = 0; i < top.length; i++) {
    if (gold.has(top[i])) return 1 / (i + 1);
  }
  return 0;
}

/** nDCG@k with binary relevance. */
export function ndcgAtK(citedPaths, goldPaths, k) {
  const gold = new Set(goldPaths);
  const top = citedPaths.slice(0, k);

  let dcg = 0;
  for (let i = 0; i < top.length; i++) {
    if (gold.has(top[i])) dcg += 1 / Math.log2(i + 2);
  }
  if (dcg === 0) return 0;

  // Ideal ranking: every gold doc packed into the leading positions.
  const ideal = Math.min(goldPaths.length, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);

  return dcg / idcg;
}

/** Linear-interpolated percentile. `p` is a fraction in 0..1. */
export function percentile(values, p) {
  if (!values.length) return 0;
  const xs = [...values].sort((a, b) => a - b);
  const pos = (xs.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
