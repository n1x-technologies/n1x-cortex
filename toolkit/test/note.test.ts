import { describe, it, expect } from 'vitest';
import { buildNote } from '../src/note.js';
import type { CortexFields } from '../src/types.js';

const FIELDS: CortexFields = { type: 'tipo', status: 'estado', id: 'id', source: 'fuente' };

describe('buildNote', () => {
  it('maps configured fields and keeps the rest in meta', () => {
    const md = [
      '---', 'tipo: regla', 'estado: documentado', 'id: RULE-01',
      'fuente: "[[FUENTE-x]]"', 'modulo: global', 'tags: [a, b]', '---',
      '# Rule One', '', 'Body [[RULE-02]].',
    ].join('\n');
    const note = buildNote('03-Reglamentos/rule-one.md', md, FIELDS);
    expect(note.type).toBe('regla');
    expect(note.status).toBe('documentado');
    expect(note.id).toBe('RULE-01');
    expect(note.source).toBe('[[FUENTE-x]]');
    expect(note.title).toBe('Rule One');
    expect(note.folder).toBe('03-Reglamentos');
    expect(note.tags).toEqual(['a', 'b']);
    expect(note.meta.modulo).toBe('global');
    expect(note.meta.tipo).toBeUndefined();        // mapped fields are not duplicated in meta
    expect(note.links.map(l => l.target)).toEqual(['RULE-02']);
  });

  it('falls back to filename for id/title when frontmatter is absent', () => {
    const note = buildNote('01-Conceptos/lonely.md', 'no frontmatter here', FIELDS);
    expect(note.id).toBe('lonely');
    expect(note.title).toBe('lonely');
    expect(note.type).toBeNull();
  });
});
