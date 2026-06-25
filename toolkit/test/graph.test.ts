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

  it('resolves links by title and basename, with id taking precedence', () => {
    const notes = [
      note({ path: 'p.md', id: 'P1', title: 'Alpha', links: [] }),
      note({ path: 'q.md', id: 'Q1', title: 'Qx', links: [{ target: 'Alpha', heading: null }] }),
      note({ path: 'BaseName.md', id: 'R1', title: 'Rx', links: [] }),
      note({ path: 's.md', id: 'S1', title: 'Sx', links: [{ target: 'BaseName', heading: null }] }),
      note({ path: 'm.md', id: 'Dup', title: 'Mx', links: [] }),
      note({ path: 'n.md', id: 'N1', title: 'Dup', links: [] }),
      note({ path: 'z.md', id: 'Z1', title: 'Zx', links: [{ target: 'Dup', heading: null }] }),
    ];
    const g = buildGraph(notes);
    expect(g.edges).toContainEqual({ from: 'Q1', to: 'P1', heading: null }); // by title
    expect(g.edges).toContainEqual({ from: 'S1', to: 'R1', heading: null }); // by basename
    expect(g.edges).toContainEqual({ from: 'Z1', to: 'Dup', heading: null }); // id beats title 'Dup'
  });
});
