import type { Note, NoteSpec } from '../types.js';

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function reconcile(spec: NoteSpec, existing: Note[]): { action: 'create' | 'skip'; matchPath: string | null } {
  const titleN = norm(spec.title);
  for (const n of existing) {
    if (n.id === spec.id || norm(n.title) === titleN) {
      return { action: 'skip', matchPath: n.path };
    }
  }
  return { action: 'create', matchPath: null };
}
