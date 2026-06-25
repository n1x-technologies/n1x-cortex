import type { NoteLink } from './types.js';

const LINK_RE = /\[\[([^\]]+)\]\]/g;
const HEADING_RE = /^#{1,6}\s+(.+?)\s*$/;

export function extractLinks(body: string): NoteLink[] {
  const links: NoteLink[] = [];
  let currentHeading: string | null = null;

  for (const line of body.split('\n')) {
    const h = line.match(HEADING_RE);
    if (h) { currentHeading = h[1]; continue; }

    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(line)) !== null) {
      const raw = m[1].split('|')[0].split('#')[0].trim();
      if (raw) links.push({ target: raw, heading: currentHeading });
    }
  }
  return links;
}
