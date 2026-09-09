/**
 * Cosine between two dense vectors.
 *
 * `ArrayLike<number>` rather than `number[]` because that is all this needs —
 * a length and an index — and because the store now hands vectors over as
 * Float32Array views into one shared buffer. Asking for a real array here
 * would force a copy per comparison, which on a vault of tens of thousands of
 * notes is the whole cost.
 *
 * The arithmetic is unchanged: the accumulators are float64 either way, so a
 * Float32Array and the array of doubles that used to be parsed out of JSON
 * give the same number down to the last bit.
 */
export function cosineDense(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}
