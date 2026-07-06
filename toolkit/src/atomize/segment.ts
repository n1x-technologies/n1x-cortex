import type { Segment } from '../types.js';

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

export function segmentSource(text: string): Segment[] {
  // strip YAML frontmatter
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = body.split('\n');
  const segments: Segment[] = [];
  let current: Segment | null = null;
  for (const line of lines) {
    const m = line.match(HEADING);
    if (m) {
      if (current) segments.push(current);
      current = { heading: m[2].trim(), level: m[1].length, body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) segments.push(current);
  return segments.map(s => ({ ...s, body: s.body.replace(/\n+$/, '') }));
}
