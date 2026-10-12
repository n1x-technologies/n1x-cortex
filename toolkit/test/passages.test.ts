// Splitting a note into passages without losing anything and without lying
// about where it was.
//
// The offsets are the delicate part: they are stored in the vector store and
// later used to take the citation from the passage that won. A shifted offset
// does not fail — it shows a slice of another part of the document, with all the
// confidence of a citation.

import { describe, it, expect } from 'vitest';
import { splitPassages, MAX_CHARS } from '../src/semantic/passages.js';
import type { Note } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}

const para = (n: number, text: string) => `Paragraph ${n}. ${text}`;

describe('splitPassages', () => {
  it('a note that fits returns a single passage', () => {
    // `embed` depends on this rule: with one passage it stores no passage
    // vectors, because the note's own already covers it.
    expect(splitPassages(note({ title: 'Short', body: 'Two sentences. Nothing else.' }))).toHaveLength(1);
  });

  it('a long note is split, and every passage fits the model window', () => {
    const body = Array.from({ length: 60 }, (_, i) => para(i, 'x'.repeat(300))).join('\n\n');
    const ps = splitPassages(note({ title: 'Long', body }));
    expect(ps.length).toBeGreaterThan(5);
    // The embedded text carries the title and headings in front, so what is
    // measured is the body taken, which is what the budget bounds.
    for (const p of ps) expect(p.end - p.start).toBeLessThanOrEqual(MAX_CHARS + 400);
  });

  it('the offsets point exactly at the passage text', () => {
    // The test that matters, and the only one that catches the error that
    // actually hurts: a shifted offset does not fail, it shows a slice of
    // ANOTHER section with the confidence of a citation. Each paragraph carries
    // a unique marker, and what is asserted is that the markers in the passage
    // and in the body slice are the same — not one more, not one fewer.
    const body = Array.from({ length: 40 }, (_, i) => `MARK${i}. ${'y'.repeat(200)}`).join('\n\n');
    const marks = (t: string) => (t.match(/MARK\d+/g) ?? []).sort();
    const ps = splitPassages(note({ title: 'Long', body }));
    expect(ps.length).toBeGreaterThan(1);
    for (const p of ps) expect(marks(body.slice(p.start, p.end))).toEqual(marks(p.text));
    // And across all passages the forty are there, each exactly once.
    expect(ps.flatMap(p => marks(p.text))).toHaveLength(40);
  });

  it('no paragraph is lost', () => {
    const body = Array.from({ length: 30 }, (_, i) => para(i, 'z'.repeat(250))).join('\n\n');
    const ps = splitPassages(note({ title: 'Long', body }));
    const all = ps.map(p => body.slice(p.start, p.end)).join('\n\n');
    for (let i = 0; i < 30; i++) expect(all).toContain(`Paragraph ${i}.`);
  });

  it('passages are in order and do not overlap', () => {
    const body = Array.from({ length: 30 }, (_, i) => para(i, 'w'.repeat(250))).join('\n\n');
    const ps = splitPassages(note({ title: 'Long', body }));
    ps.forEach((p, i) => expect(p.idx).toBe(i));
    for (let i = 1; i < ps.length; i++) expect(ps[i].start).toBeGreaterThanOrEqual(ps[i - 1].end);
  });

  it('a heading opens a passage, and its trail travels with the text', () => {
    // A paragraph stating a figure without naming the thing it measures answers
    // nothing on its own. Under its heading, it does.
    const body = [
      '## Section A', '', para(1, 'a'.repeat(100)), '',
      '## Section B', '', para(2, 'b'.repeat(100)),
    ].join('\n');
    const ps = splitPassages(note({ title: 'Doc', body }));
    expect(ps).toHaveLength(2);
    expect(ps[0].text).toContain('Doc › Section A');
    expect(ps[1].text).toContain('Doc › Section B');
    expect(ps[1].text).not.toContain('Section A');
  });

  it('the trail nests and is pruned when the level rises', () => {
    const body = [
      '# One', '', '## Two', '', para(1, 'a'.repeat(50)), '',
      '# Three', '', para(2, 'b'.repeat(50)),
    ].join('\n');
    const ps = splitPassages(note({ title: 'T', body }));
    expect(ps[0].text).toContain('T › One › Two');
    // Back at level 1, "Two" no longer applies.
    expect(ps[1].text).toContain('T › Three');
    expect(ps[1].text).not.toContain('Two');
  });

  it('a paragraph longer than the budget is split between sentences', () => {
    // This really happens: text transcribed from a document without a single
    // line break. Without it, that paragraph is embedded truncated and the rest
    // is lost.
    const sentence = 'This is a filler sentence of sufficient length. ';
    const ps = splitPassages(note({ title: 'Mono', body: sentence.repeat(120) }));
    expect(ps.length).toBeGreaterThan(2);
    for (const p of ps) expect(p.end - p.start).toBeLessThanOrEqual(MAX_CHARS + 400);
  });

  it('a note with no body does not blow up and still says something', () => {
    const ps = splitPassages(note({ title: 'Title only', body: '' }));
    expect(ps).toHaveLength(1);
    expect(ps[0].text).toContain('Title only');
  });

  it('a note that is only headings leaves one passage with what it says', () => {
    const ps = splitPassages(note({ title: 'Index', body: '# One\n## Two\n' }));
    expect(ps).toHaveLength(1);
    expect(ps[0].text).toContain('Index');
  });
});
