import { tokenize } from './tokenize.js';
import { stripLinkSyntax } from '../wikilinks.js';
import type { Note } from '../types.js';

export interface SearchIndex {
  notes: Note[];
  df: Map<string, number>;
  tf: Map<number, Map<string, number>>;
  /** Each note's length, in weighted terms. See `searchIndex`. */
  len: Map<number, number>;
  /** The average length, which is what each note is measured against. */
  avgLen: number;
}

/**
 * BM25: how fast one more repetition saturates.
 *
 * At k1 = 1.2, the tenth time a note repeats a term adds little over the ninth.
 * It is the long-standing value in the literature, and nothing measured here
 * asks for another.
 */
const K1 = 1.2;

/**
 * How much length is penalised. 0 = not at all, 1 = fully.
 *
 * 0.75 is the standard value, and here it is needed in full: the corpus holds
 * three-sentence notes and two-hundred-thousand-character notes in one bag.
 */
const B = 0.75;

export function buildIndex(notes: Note[]): SearchIndex {
  const df = new Map<string, number>();
  const tf = new Map<number, Map<string, number>>();
  const len = new Map<number, number>();
  let total = 0;
  notes.forEach((n, i) => {
    const terms = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokenize(text)) terms.set(t, (terms.get(t) ?? 0) + weight);
    };
    add(n.title, 3);
    add(n.tags.join(' '), 2);
    add(stripLinkSyntax(n.body), 1);
    tf.set(i, terms);
    // Length is measured in the same currency as frequency — weighted terms,
    // not characters — so the numerator and the divisor speak of the same thing.
    let sum = 0;
    for (const f of terms.values()) sum += f;
    len.set(i, sum);
    total += sum;
    for (const t of terms.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  });
  return { notes, df, tf, len, avgLen: notes.length ? total / notes.length : 0 };
}

/**
 * Lexical ranking, by BM25.
 *
 * This used to be `score += f * idf`: raw frequency, with no normalisation for
 * length. It sounds harmless and is not. A vault mixes three-sentence notes with
 * imported documents of hundreds of thousands of characters, and the long
 * document repeats any ordinary term hundreds of times while the short note that
 * is exactly about that topic says it once. Measured on such a vault: the long
 * one scored one thousand nine hundred and the short one a hundred and seven, so
 * any question sharing ONE word with the long document returned it first and
 * buried the note that actually answered.
 *
 * BM25 fixes both halves of that:
 *
 *   · it saturates frequency — `f/(f + k1·…)` — so the two hundredth mention is
 *     worth nearly what the twentieth was, and
 *   · it divides by length against the average, so a small note about something
 *     competes with a huge note that mentions it in passing.
 *
 * The `idf` changes too: `ln(1 + (N − df + 0.5)/(df + 0.5))` instead of
 * `ln(1 + N/df)`. The leading `+1` is not decoration — without it a term present
 * in more than half the corpus yields a NEGATIVE idf and would subtract score.
 */
export function searchIndex(index: SearchIndex, query: string): { index: number; score: number }[] {
  const qterms = tokenize(query);
  const N = Math.max(1, index.notes.length);
  const avg = index.avgLen || 1;
  const out: { index: number; score: number }[] = [];
  for (const [i, terms] of index.tf) {
    let score = 0;
    const norm = 1 - B + B * ((index.len.get(i) ?? 0) / avg);
    for (const qt of qterms) {
      const f = terms.get(qt);
      if (!f) continue;
      const df = index.df.get(qt) ?? 1;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * (f * (K1 + 1)) / (f + K1 * norm);
    }
    if (score > 0) out.push({ index: i, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
