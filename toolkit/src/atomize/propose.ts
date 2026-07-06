import type { Segment, NoteSpec, CortexConfig } from '../types.js';

export function slug(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function proposeNotes(segments: Segment[], sourceName: string, config: CortexConfig): NoteSpec[] {
  const status = config.statusLifecycle[0] ?? 'draft';
  return segments.map(seg => ({
    id: slug(seg.heading),
    title: seg.heading,
    type: null,
    body: seg.body,
    source: sourceName,
    status,
    folder: null,
  }));
}
