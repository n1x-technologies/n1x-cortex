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

  it('does not let a wikilink target slug outrank the note it names', () => {
    // Regression test: several notes merely *reference* the meeting note via
    // [[reunion-directorio-2026-q1]]. Before the fix, that raw slug was
    // tokenized as prose ("reunion", "directorio", "2026", "q1") in every
    // referencing note, drowning out the actual meeting note in the ranking.
    const referencing = [
      note({ id: 'REF-1', title: 'Marketing', body: 'Resumen trimestral en [[reunion-directorio-2026-q1]].' }),
      note({ id: 'REF-2', title: 'Ventas', body: 'Aprobado en [[reunion-directorio-2026-q1]].' }),
      note({ id: 'REF-3', title: 'Producto', body: 'Presentado en [[reunion-directorio-2026-q1]].' }),
    ];
    const target = note({
      id: 'reunion-directorio-2026-q1',
      title: 'Reunión de Directorio — Q1 2026',
      body: 'CEO, VP de Ingeniería, VP de Ventas y directora de Marketing.',
    });
    const all = [...referencing, target];
    const idx = buildIndex(all);
    const r = searchIndex(idx, 'cuando fue la ultima reunion');
    expect(r.length).toBeGreaterThan(0);
    expect(all[r[0].index].id).toBe('reunion-directorio-2026-q1');
  });
});
