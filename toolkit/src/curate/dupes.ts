// toolkit/src/curate/dupes.ts
import { resolve } from 'node:path';
import { scanVault } from '../vault.js';
import { buildIndex } from '../search/index.js';
import { loadStore, storeMap, hashContent } from '../semantic/store.js';
import { noteText } from '../semantic/text.js';
import { cosineDense } from '../semantic/cosine.js';
import type { CortexConfig } from '../types.js';

export interface DupePair {
  a: string;
  b: string;
  lexical: number;
  semantic: number;
  via: 'lexical' | 'semantic' | 'both';
  score: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const pairKey = (a: string, b: string) => a < b ? `${a}\0${b}` : `${b}\0${a}`;

export function computeDupes(vaultDir: string, config: CortexConfig, threshold: number): DupePair[] {
  const notes = scanVault(vaultDir, config);
  const merged = new Map<string, DupePair>();

  // ── Lexical pairs (TF-IDF cosine via inverted index) ──
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
  for (const idxs of inverted.values()) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x], j = idxs[y];
        if (i === j) continue;
        const k = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const [small, large] = vecs[i].size < vecs[j].size ? [vecs[i], vecs[j]] : [vecs[j], vecs[i]];
        let dot = 0;
        for (const [t, w] of small) { const w2 = large.get(t); if (w2) dot += w * w2; }
        const cos = dot / (norms[i] * norms[j]);
        if (cos >= threshold) {
          const [a, b] = [notes[i].path, notes[j].path].sort();
          merged.set(pairKey(a, b), { a, b, lexical: round2(cos), semantic: 0, via: 'lexical', score: round2(cos) });
        }
      }
    }
  }

  // ── Semantic pairs (dense cosine over the embedding store) ──
  const store = loadStore(resolve(vaultDir, config.embedDir));
  if (store && store.model === config.embedModel && store.records.length) {
    const recMap = storeMap(store);
    const dense: { path: string; vector: number[] }[] = [];
    for (const n of notes) {
      const rec = recMap.get(n.path);
      if (rec && rec.hash === hashContent(noteText(n))) dense.push({ path: n.path, vector: rec.vector });
    }
    for (let i = 0; i < dense.length; i++) {
      for (let j = i + 1; j < dense.length; j++) {
        const cos = cosineDense(dense[i].vector, dense[j].vector);
        if (cos >= config.semanticDupeThreshold) {
          const [a, b] = [dense[i].path, dense[j].path].sort();
          const key = pairKey(a, b);
          const ex = merged.get(key);
          if (ex) {
            ex.semantic = round2(cos);
            ex.via = 'both';
            ex.score = Math.max(ex.lexical, ex.semantic);
          } else {
            merged.set(key, { a, b, lexical: 0, semantic: round2(cos), via: 'semantic', score: round2(cos) });
          }
        }
      }
    }
  }

  return [...merged.values()].sort(
    (p, q) => q.score - p.score || p.a.localeCompare(q.a) || p.b.localeCompare(q.b),
  );
}
