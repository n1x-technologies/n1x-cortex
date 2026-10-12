// That a long note does not win for being long.
//
// This was the lexical ranking's defect, and the more expensive of the two,
// because it is invisible: the list comes out ordered, with scores, and the note
// that answered is fifteenth. The score used to be `frequency × idf` with no
// normalisation, so an imported document of hundreds of thousands of characters
// — which repeats any ordinary term dozens of times — beat the three-sentence
// note that is exactly about it.

import { describe, it, expect } from 'vitest';
import { buildIndex, searchIndex } from '../src/search/index.js';
import type { Note } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}

/** A long document that mentions `term` many times, in passing. */
function long(id: string, term: string, times: number): Note {
  const filler = Array.from({ length: 400 }, (_, i) => `sentence number ${i} about assorted matters`);
  for (let i = 0; i < times; i++) filler.splice(i * 7, 0, `and regarding the ${term} it is recorded`);
  return note({ id, title: 'Complete imported document', body: filler.join('. ') });
}

const short = () => note({
  id: 'SHORT',
  title: 'Limit of the operation',
  body: 'The limit applying to an operation is defined here.',
});

describe('BM25 in the lexical ranking', () => {
  it('a short precise note beats a long document that mentions it in passing', () => {
    // Under `f × idf` the long document won by a landslide: fifty mentions
    // against four. What should decide is not how many times it is said but how
    // much of the note is about it.
    const brief = short();
    const doc = long('LONG', 'limit', 50);
    const r = searchIndex(buildIndex([doc, brief]), 'limit of the operation');
    expect(r.map(x => [doc, brief][x.index].id)[0]).toBe('SHORT');
  });

  it('the long document still appears: it is ordered differently, not hidden', () => {
    // Pushing it down is not discarding it. If it really is what was wanted it
    // has to be there, and a fix that dropped it from the list would trade one
    // problem for its opposite.
    const brief = short();
    const doc = long('LONG', 'limit', 50);
    const r = searchIndex(buildIndex([doc, brief]), 'limit of the operation');
    expect(r.map(x => [doc, brief][x.index].id)).toContain('LONG');
  });

  it('repetition does not scale: the fiftieth mention is worth nearly the fifth', () => {
    // Saturation is half the fix. Without it, saying something ten times more
    // is worth ten times more, and a search is won by writing more.
    const few = long('FEW', 'limit', 5);
    const many = long('MANY', 'limit', 50);
    const r = searchIndex(buildIndex([few, many]), 'limit');
    const scores = new Map(r.map(x => [[few, many][x.index].id, x.score]));
    expect(scores.get('MANY')! / scores.get('FEW')!).toBeLessThan(2);
  });

  it('a term present in almost every note does not subtract score', () => {
    // The classic `ln(N/df)` idf goes NEGATIVE once a term is in more than half
    // the corpus, and then the note that also says it scores LESS than the note
    // that does not. With `ln(1 + …)` that cannot happen.
    const notes = Array.from({ length: 5 }, (_, i) =>
      note({ id: `N${i}`, title: 'Minutes', body: 'the agreement was signed by everyone' }));
    const r = searchIndex(buildIndex(notes), 'agreement');
    expect(r.length).toBe(5);
    for (const x of r) expect(x.score).toBeGreaterThan(0);
  });

  it('an empty vault does not divide by zero', () => {
    const idx = buildIndex([]);
    expect(idx.avgLen).toBe(0);
    expect(searchIndex(idx, 'anything at all')).toEqual([]);
  });
});
