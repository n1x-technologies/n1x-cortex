import type { NoteLink } from './types.js';

const LINK_RE = /\[\[([^\]]+)\]\]/g;
const HEADING_RE = /^#{1,6}\s+(.+?)\s*$/;

// Removes `[[target]]` / `[[target|alias]]` markup, keeping the alias text
// (real prose the author wrote) but dropping the link target slug — a
// filename-derived string like "reunion-directorio-2026-q1" that should not
// be scored as if it were content of the note that contains the link.
export function stripLinkSyntax(body: string): string {
  return body.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const alias = inner.split(/\\?\|/)[1];
    return alias ? alias.trim() : '';
  });
}

export function extractLinks(body: string): NoteLink[] {
  const links: NoteLink[] = [];
  let currentHeading: string | null = null;

  for (const line of body.split('\n')) {
    const h = line.match(HEADING_RE);
    if (h) { currentHeading = h[1]; continue; }

    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(line)) !== null) {
      // Split on the alias pipe, escaped (`\|`, required inside Obsidian
      // tables) or bare (`|`), so the backslash never sticks to the target.
      const raw = m[1].split(/\\?\|/)[0].split('#')[0].trim();
      if (raw) links.push({ target: raw, heading: currentHeading });
    }
  }
  return links;
}
