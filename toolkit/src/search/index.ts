import { tokenize } from './tokenize.js';
import { stripLinkSyntax } from '../wikilinks.js';
import type { Note } from '../types.js';

export interface SearchIndex {
  notes: Note[];
  df: Map<string, number>;
  tf: Map<number, Map<string, number>>;
}

export function buildIndex(notes: Note[]): SearchIndex {
  const df = new Map<string, number>();
  const tf = new Map<number, Map<string, number>>();
  notes.forEach((n, i) => {
    const terms = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokenize(text)) terms.set(t, (terms.get(t) ?? 0) + weight);
    };
    add(n.title, 3);
    add(n.tags.join(' '), 2);
    add(stripLinkSyntax(n.body), 1);
    tf.set(i, terms);
    for (const t of terms.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  });
  return { notes, df, tf };
}

export function searchIndex(index: SearchIndex, query: string): { index: number; score: number }[] {
  const qterms = tokenize(query);
  const N = Math.max(1, index.notes.length);
  const out: { index: number; score: number }[] = [];
  for (const [i, terms] of index.tf) {
    let score = 0;
    for (const qt of qterms) {
      const f = terms.get(qt);
      if (!f) continue;
      const idf = Math.log(1 + N / (index.df.get(qt) ?? 1));
      score += f * idf;
    }
    if (score > 0) out.push({ index: i, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
