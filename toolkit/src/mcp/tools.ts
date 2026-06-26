import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { runQuerySemantic } from '../commands/query.js';
import type { Embedder } from '../semantic/embedder.js';
import type { Note } from '../types.js';

export interface QueryHitOut {
  id: string;
  title: string;
  path: string;
  excerpt: string;
  source: string | null;
  score: number;
  via: 'anchor' | 'link';
}
export interface QueryToolResult {
  question: string;
  hits: QueryHitOut[];
  sources: string[];
}

export async function queryTool(
  vaultDir: string,
  args: { question: string; maxHits?: number },
  embedder?: Embedder,
): Promise<QueryToolResult> {
  const result = await runQuerySemantic(vaultDir, args.question, embedder);
  const maxHits = args.maxHits ?? 8;
  return {
    question: result.question,
    hits: result.hits.slice(0, maxHits).map(h => ({
      id: h.id,
      title: h.title,
      path: h.path,
      excerpt: h.excerpt,
      source: h.source,
      score: h.score,
      via: h.via,
    })),
    sources: result.sources,
  };
}

export interface NotePayload {
  id: string;
  title: string;
  path: string;
  type: string | null;
  status: string | null;
  tags: string[];
  source: string | null;
  body: string;
}

export function getNoteTool(vaultDir: string, args: { id?: string; path?: string }): NotePayload {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  let note: Note | undefined;
  if (args.id) note = notes.find(n => n.id === args.id);
  else if (args.path) note = notes.find(n => n.path === args.path);
  const ref = args.id ?? args.path ?? '(no id or path)';
  if (!note) throw new Error(`note not found: ${ref}`);
  return {
    id: note.id,
    title: note.title,
    path: note.path,
    type: note.type,
    status: note.status,
    tags: note.tags,
    source: note.source,
    body: note.body,
  };
}
