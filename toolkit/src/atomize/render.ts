import type { NoteSpec, CortexConfig } from '../types.js';

export function renderNote(spec: NoteSpec, config: CortexConfig): string {
  const f = config.fields;
  const fm: string[] = ['---'];
  fm.push(`${f.id}: ${spec.id}`);
  if (spec.type) fm.push(`${f.type}: ${spec.type}`);
  fm.push(`${f.status}: "${spec.status}"`);
  const safeSource = spec.source.replace(/"/g, '\\"');
  fm.push(`${f.source}: "[[${safeSource}]]"`);
  fm.push('---');
  return [
    fm.join('\n'),
    '',
    `# ${spec.title}`,
    '',
    spec.body.trim(),
    '',
    `*Source: [[${spec.source}]]*`,
    '',
  ].join('\n');
}
