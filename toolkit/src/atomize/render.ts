import type { NoteSpec, CortexConfig } from '../types.js';

export function renderNote(spec: NoteSpec, config: CortexConfig): string {
  const f = config.fields;
  const fm: string[] = ['---'];
  fm.push(`${f.id}: ${spec.id}`);
  if (spec.type) fm.push(`${f.type}: ${spec.type}`);
  // Defensive: a distiller may hand back tags as a non-array; only render a real list.
  if (Array.isArray(spec.tags) && spec.tags.length) fm.push(`tags: [${spec.tags.join(', ')}]`);
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

export function renderUpdatedNote(existingContent: string, mergedBody: string, source: string): string {
  const m = existingContent.match(/^---\n[\s\S]*?\n---\n?/);
  const frontmatter = (m ? m[0] : '').replace(/\n+$/, ''); // verbatim block, trailing newlines normalized
  const body = mergedBody.trim();
  const parts = [frontmatter, '', body, ''];
  if (!body.includes(`[[${source}]]`)) parts.push(`*Source: [[${source}]]*`, '');
  return parts.join('\n');
}
