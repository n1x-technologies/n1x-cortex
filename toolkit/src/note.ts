import { parseFrontmatter } from './frontmatter.js';
import { extractLinks } from './wikilinks.js';
import type { Note, CortexFields } from './types.js';

function basename(relPath: string): string {
  const file = relPath.split('/').pop() ?? relPath;
  return file.replace(/\.md$/i, '');
}

function firstHeading(body: string): string | null {
  for (const line of body.split('\n')) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function buildNote(relPath: string, content: string, fields: CortexFields): Note {
  const { data, body } = parseFrontmatter(content);
  const file = basename(relPath);

  const tagsRaw = data.tags;
  const tags = Array.isArray(tagsRaw) ? tagsRaw.map(String) : [];

  const mapped = new Set([fields.type, fields.status, fields.id, fields.source, 'tags']);
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!mapped.has(k)) meta[k] = v;

  const source = asString(data[fields.source])?.replace(/^\[\[|\]\]$/g, '') ?? null;

  return {
    path: relPath,
    id: asString(data[fields.id]) ?? file,
    title: firstHeading(body) ?? file,
    type: asString(data[fields.type]),
    status: asString(data[fields.status]),
    tags,
    meta,
    folder: relPath.includes('/') ? relPath.split('/')[0] : '',
    links: extractLinks(body),
    source,
    body,
  };
}
