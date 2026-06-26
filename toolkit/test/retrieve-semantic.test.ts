import { describe, it, expect } from 'vitest';
import { retrieve } from '../src/query/retrieve.js';
import { buildGraph } from '../src/graph.js';
import type { Note } from '../src/types.js';

const note = (id: string, body: string): Note => ({
  path: `N/${id}.md`, id, title: id, type: null, status: null, tags: [],
  meta: {}, folder: 'N', links: [], source: null, body,
});

describe('retrieve with semantic ranking', () => {
  const notes = [note('A', 'the operation limit is five units'), note('C', 'completely unrelated text about gardening')];
  const graph = buildGraph(notes);

  it('without a semantic ranking, C (no lexical match) is not an anchor', () => {
    const r = retrieve(notes, graph, 'operation limit', { maxHits: 5 });
    expect(r.hits.find(h => h.id === 'C')).toBeUndefined();
  });

  it('a semantic ranking promotes C into the anchors', () => {
    const r = retrieve(notes, graph, 'operation limit', { maxHits: 5, semanticRanking: ['C', 'A'], rrfK: 60 });
    const c = r.hits.find(h => h.id === 'C');
    expect(c).toBeDefined();
    expect(c!.via).toBe('anchor');
  });
});
