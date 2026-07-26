// Pure scoring functions. Kept dependency-free and separately tested because a
// silent bug here corrupts every published number without failing anything.

/** Binary-relevance recall@k: what fraction of gold docs appear in the top k. */
export function recallAtK(citedPaths, goldPaths, k) {
  if (!goldPaths.length) return 0;
  const top = new Set(citedPaths.slice(0, k));
  const found = goldPaths.filter(g => top.has(g)).length;
  return found / goldPaths.length;
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
