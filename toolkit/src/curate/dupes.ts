// toolkit/src/curate/dupes.ts
import { scanVault } from '../vault.js';
import { buildIndex } from '../search/index.js';
import type { CortexConfig } from '../types.js';

export interface DupePair { a: string; b: string; score: number }

export function computeDupes(vaultDir: string, config: CortexConfig, threshold: number): DupePair[] {
  const notes = scanVault(vaultDir, config);
  const index = buildIndex(notes);
  const N = Math.max(1, notes.length);

  const vecs: Map<string, number>[] = [];
  const norms: number[] = [];
  const inverted = new Map<string, number[]>();
  notes.forEach((_, i) => {
    const terms = index.tf.get(i) ?? new Map<string, number>();
    const v = new Map<string, number>();
    let sumSq = 0;
    for (const [t, f] of terms) {
      const idf = Math.log(1 + N / (index.df.get(t) ?? 1));
      const w = f * idf;
      v.set(t, w);
      sumSq += w * w;
      (inverted.get(t) ?? inverted.set(t, []).get(t)!).push(i);
    }
    vecs[i] = v;
    norms[i] = Math.sqrt(sumSq) || 1;
  });

  const seen = new Set<string>();
  const pairs: DupePair[] = [];
  for (const idxs of inverted.values()) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x], j = idxs[y];
        if (i === j) continue;
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [small, large] = vecs[i].size < vecs[j].size ? [vecs[i], vecs[j]] : [vecs[j], vecs[i]];
        let dot = 0;
        for (const [t, w] of small) { const w2 = large.get(t); if (w2) dot += w * w2; }
        const cos = dot / (norms[i] * norms[j]);
        if (cos >= threshold) {
          const [a, b] = [notes[i].path, notes[j].path].sort();
          pairs.push({ a, b, score: Math.round(cos * 100) / 100 });
        }
      }
    }
  }
  return pairs.sort((p, q) => q.score - p.score || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}
