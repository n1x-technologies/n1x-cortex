// Which line a long document gets cited by.
//
// The citation is the only thing a reader — or an agent — sees before deciding
// whether the note is worth opening, so on a document of thousands of lines it
// is most of the answer. The order here was measured, not assumed: a line that
// shares words with the question beats the passage the model picked, because on
// a long document the model scores every passage within about two hundredths of
// the top one and which one "won" is close to arbitrary.

import { describe, it, expect } from 'vitest';
import { retrieve } from '../src/query/retrieve.js';
import { buildGraph } from '../src/graph.js';
import type { Note } from '../src/types.js';

const note = (id: string, body: string): Note => ({
  path: `N/${id}.md`, id, title: id, type: null, status: null, tags: [],
  meta: {}, folder: 'N', links: [], source: null, body,
});

// Two sections far apart. The first holds the words of the question; the second
// is where a window will point.
const body = [
  'Section one. The balance of the old account was left unassigned.',
  ...Array.from({ length: 30 }, (_, i) => `Filler paragraph ${i} with nothing of interest in it.`),
  'Section two. Unrelated wording about scheduling and rooms.',
].join('\n\n');

const long = note('LONG', body);
const graph = buildGraph([long]);
/** Where "Section two" sits — what the model would hand over as its window. */
const far = { start: body.indexOf('Section two.'), end: body.length };

// The window never travels on its own: it comes back from the same call that
// produced the ranking, so a test that passes one without the other is testing
// a state that cannot happen.
const anchored = (extra: Record<string, unknown> = {}) =>
  ({ semanticRanking: ['LONG'], rrfK: 60, ...extra });

describe('the citation of a long document', () => {
  it('a line sharing the question\'s words wins over the window', () => {
    const r = retrieve([long], graph, 'balance of the old account', anchored({
      windows: new Map([['LONG', far]]),
    }));
    expect(r.hits[0].excerpt).toContain('balance of the old account');
  });

  it('the same citation comes out with no window at all', () => {
    // The window is a fallback, so having one must not change the answer when
    // there is a line that shares words.
    const r = retrieve([long], graph, 'balance of the old account', anchored());
    expect(r.hits[0].excerpt).toContain('balance of the old account');
  });

  it('when no line shares a word, the window decides where to cite from', () => {
    // Otherwise the citation is the document's first line, which on a long
    // import is its cover page.
    const r = retrieve([long], graph, 'scheduling', anchored({
      windows: new Map([['LONG', far]]),
    }));
    expect(r.hits[0].excerpt).toContain('Section two');
  });

  it('a window pointing outside the body falls back instead of crashing', () => {
    // A stale store can hand over a window measured on a body that has since
    // been edited. Citing out of bounds is a crash or a lie.
    for (const broken of [{ start: 9e9, end: 9e9 + 10 }, { start: -5, end: 2 }, { start: 10, end: 10 }]) {
      const r = retrieve([long], graph, 'nothing matches this at all', anchored({
        windows: new Map([['LONG', broken]]),
      }));
      expect(r.hits[0].excerpt.length).toBeGreaterThan(0);
    }
  });

  it('a note with no entry in the windows map is cited as it always was', () => {
    const other = note('OTHER', 'Talks about the balance too.');
    const g = buildGraph([long, other]);
    const r = retrieve([long, other], g, 'balance', {
      semanticRanking: ['LONG', 'OTHER'], rrfK: 60,
      windows: new Map([['LONG', far]]),
    });
    expect(r.hits.find(h => h.id === 'OTHER')!.excerpt).toContain('Talks about the balance');
  });

  it('an empty windows map changes nothing', () => {
    const plain = retrieve([long], graph, 'balance', anchored());
    const empty = retrieve([long], graph, 'balance', anchored({ windows: new Map() }));
    expect(empty.hits[0].excerpt).toBe(plain.hits[0].excerpt);
  });
});
