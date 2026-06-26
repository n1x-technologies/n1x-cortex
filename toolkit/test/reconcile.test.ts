import { describe, it, expect } from 'vitest';
import { reconcile } from '../src/atomize/reconcile.js';
import type { Note, NoteSpec } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}
const spec: NoteSpec = { id: 'operation-limit', title: 'Operation limit', type: null,
  body: '', source: 'S', status: 'draft', folder: null };

describe('reconcile', () => {
  it('skips when an existing note shares the id', () => {
    const r = reconcile(spec, [note({ id: 'operation-limit', path: '03-Rules/x.md' })]);
    expect(r).toEqual({ action: 'skip', matchPath: '03-Rules/x.md' });
  });
  it('skips when an existing note has a matching normalized title', () => {
    const r = reconcile(spec, [note({ id: 'other', title: 'Operation Limit', path: '03-Rules/y.md' })]);
    expect(r).toEqual({ action: 'skip', matchPath: '03-Rules/y.md' });
  });
  it('creates when nothing matches', () => {
    const r = reconcile(spec, [note({ id: 'unrelated', title: 'Colors' })]);
    expect(r).toEqual({ action: 'create', matchPath: null });
  });
});
