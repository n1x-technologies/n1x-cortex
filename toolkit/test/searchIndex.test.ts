import { describe, it, expect } from 'vitest';
import { buildIndex, searchIndex } from '../src/search/index.js';
import type { Note } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}

describe('searchIndex', () => {
  const notes = [
    note({ id: 'LIMIT', title: 'Operation limit', body: 'The applicable limit for an operation is defined here.' }),
    note({ id: 'OTHER', title: 'Colors', body: 'Unrelated note about colors and shapes.' }),
    note({ id: 'MENTION', title: 'Process', body: 'A process that mentions the limit only once.' }),
  ];
  const index = buildIndex(notes);

  it('ranks the most relevant note first', () => {
    const r = searchIndex(index, 'operation limit');
    expect(notes[r[0].index].id).toBe('LIMIT');
  });
  it('returns only notes that match, sorted by score desc', () => {
    const r = searchIndex(index, 'limit');
    const ids = r.map(x => notes[x.index].id);
    expect(ids).toContain('LIMIT');
    expect(ids).toContain('MENTION');
    expect(ids).not.toContain('OTHER');
    expect(r[0].score).toBeGreaterThanOrEqual(r[r.length - 1].score);
  });
});
