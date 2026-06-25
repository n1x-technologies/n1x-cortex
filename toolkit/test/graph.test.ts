import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph.js';
import type { Note } from '../src/types.js';

function note(partial: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...partial };
}

describe('buildGraph', () => {
  it('resolves links and flags dangling targets as orphans', () => {
    const notes = [
      note({ path: 'a.md', id: 'A', title: 'Alpha', links: [{ target: 'B', heading: null }, { target: 'Ghost', heading: null }] }),
      note({ path: 'b.md', id: 'B', title: 'Beta', links: [] }),
    ];
    const g = buildGraph(notes);
    expect(g.edges).toContainEqual({ from: 'A', to: 'B', heading: null });
    expect(g.orphans).toEqual(['Ghost']);
    expect(g.nodes.get('Ghost')?.exists).toBe(false);
    expect(g.nodes.get('A')?.exists).toBe(true);
  });
});
