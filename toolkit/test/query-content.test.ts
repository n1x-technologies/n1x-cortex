// `excerpt` is capped at 200 characters, which is a reasonable default for a
// terminal and far too little for the thing this engine exists to do: hand a
// model the cited passage. A consumer feeding an 8.8k-character note to a model
// was giving it ~1% of the note and getting "I couldn't find this in the
// source" back, with retrieval and ranking both working correctly. The failure
// is invisible from the outside, which is what these tests pin down.
import { describe, it, expect } from 'vitest';
import { retrieve } from '../src/query/retrieve.js';
import { buildGraph } from '../src/graph.js';
import type { Note } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}

const LONG = 'The applicable limit for an operation of type X is 5 units. ' + 'filler sentence. '.repeat(200);

const notes = [
  note({ id: 'RULE-LIMIT', path: '03-Rules/limit.md', title: 'Operation limit', body: LONG, links: [] }),
  note({ id: 'NOISE', path: '01-Concepts/noise.md', title: 'Colors', body: 'Unrelated note about colors.', links: [] }),
];
const graph = buildGraph(notes);
const ask = (opts = {}) => retrieve(notes, graph, 'what is the operation limit', opts);

describe('query content', () => {
  it('omits the content field entirely by default', () => {
    // Not "" and not the body: absent. Consumers distinguish "not requested"
    // from "requested and empty", and the default output shape must not grow.
    const hit = ask().hits.find(h => h.id === 'RULE-LIMIT')!;
    expect(hit.content).toBeUndefined();
    expect('content' in hit).toBe(false);
  });

  it('still caps the excerpt at 200 characters', () => {
    // The excerpt is unchanged by any of this — content is additive.
    const hit = ask().hits.find(h => h.id === 'RULE-LIMIT')!;
    expect(hit.excerpt.length).toBeLessThanOrEqual(200);
  });

  it("returns the whole body under content: 'full'", () => {
    const hit = ask({ content: 'full' }).hits.find(h => h.id === 'RULE-LIMIT')!;
    expect(hit.content).toBe(LONG);
    expect(hit.content!.length).toBeGreaterThan(1000);
  });

  it('truncates to the requested cap', () => {
    const hit = ask({ content: 500 }).hits.find(h => h.id === 'RULE-LIMIT')!;
    expect(hit.content!.length).toBe(500);
    expect(LONG.startsWith(hit.content!)).toBe(true);
  });

  it('does not pad a body shorter than the cap', () => {
    const hit = ask({ content: 5000 }).hits.find(h => h.id === 'NOISE');
    if (hit) expect(hit.content).toBe('Unrelated note about colors.');
  });

  it('accepts a cap of 0 as an empty string, not as "no content"', () => {
    // The distinction matters: 0 keeps the field so the output shape is stable
    // across calls. Treating 0 as absent would make the shape depend on a value.
    const hit = ask({ content: 0 }).hits.find(h => h.id === 'RULE-LIMIT')!;
    expect(hit.content).toBe('');
    expect('content' in hit).toBe(true);
  });
});

describe('query limit', () => {
  // A hub linking to everything. Without links the engine only ever reaches
  // what its 5 anchors seed, so a flat list of 30 notes returns 5 hits and the
  // limit is never the binding constraint — the default would look like 5 and
  // the test would be measuring anchor count, not maxHits.
  const leaves = Array.from({ length: 29 }, (_, i) =>
    note({ id: `N${i}`, path: `n/${i}.md`, title: `Operation limit note ${i}`,
           body: 'The applicable limit for an operation of type X is 5 units.', links: [] }));
  const hub = note({ id: 'HUB', path: 'n/hub.md', title: 'Operation limit index',
                     body: 'Index of operation limit notes.',
                     links: leaves.map(l => ({ target: l.id, heading: 'Relacionadas' })) });
  const many = [hub, ...leaves];
  const g = buildGraph(many);

  it('defaults to 12 hits', () => {
    expect(retrieve(many, g, 'operation limit').hits.length).toBe(12);
  });

  it('honours a smaller limit', () => {
    expect(retrieve(many, g, 'operation limit', { maxHits: 4 }).hits.length).toBe(4);
  });

  it('honours a limit larger than the default', () => {
    // The point of the flag: 12 was a hard ceiling with no way past it, and it
    // is also what kept output under the pipe buffer, masking the flush bug.
    expect(retrieve(many, g, 'operation limit', { maxHits: 25 }).hits.length).toBe(25);
  });

  it('keeps sources consistent with the hits actually returned', () => {
    const r = retrieve(many, g, 'operation limit', { maxHits: 3 });
    for (const h of r.hits) expect(r.sources).toContain(h.path);
    expect(r.sources.length).toBeLessThanOrEqual(3 * 2);
  });
});
