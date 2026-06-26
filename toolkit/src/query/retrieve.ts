import { buildIndex, searchIndex } from '../search/index.js';
import { excerpt } from './excerpt.js';
import type { Note, Graph, QueryResult, QueryHit } from '../types.js';

export function retrieve(
  notes: Note[],
  graph: Graph,
  question: string,
  opts: { maxAnchors?: number; hops?: number; maxHits?: number } = {},
): QueryResult {
  const maxAnchors = opts.maxAnchors ?? 5;
  const hops = opts.hops ?? 2;
  const maxHits = opts.maxHits ?? 12;

  const index = buildIndex(notes);
  const ranked = searchIndex(index, question);
  const byId = new Map<string, Note>();
  notes.forEach(n => byId.set(n.id, n));

  const ftsById = new Map<string, number>();
  ranked.forEach(r => ftsById.set(notes[r.index].id, r.score));

  const anchorIds = ranked.slice(0, maxAnchors).map(r => notes[r.index].id);
  const anchorSet = new Set(anchorIds);

  // adjacency (both directions) over the graph's edges
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let s = adj.get(a);
    if (!s) { s = new Set(); adj.set(a, s); }
    s.add(b);
  };
  for (const e of graph.edges) { link(e.from, e.to); link(e.to, e.from); }

  // BFS distance from the anchors, up to `hops`
  const dist = new Map<string, number>();
  anchorIds.forEach(id => dist.set(id, 0));
  let frontier = [...anchorIds];
  for (let d = 1; d <= hops && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!dist.has(nb)) { dist.set(nb, d); next.push(nb); }
      }
    }
    frontier = next;
  }

  const hits: QueryHit[] = [];
  for (const [id, d] of dist) {
    const note = byId.get(id);
    if (!note) continue; // skip dangling/orphan targets — only real notes are citable
    const fts = ftsById.get(id) ?? 0;
    const proximity = (1 / (1 + d)) * (anchorSet.has(id) ? 2 : 0.5);
    hits.push({
      path: note.path,
      id: note.id,
      title: note.title,
      type: note.type,
      score: fts + proximity,
      excerpt: excerpt(note.body, question),
      source: note.source,
      via: anchorSet.has(id) ? 'anchor' : 'link',
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, maxHits);

  const sources = [...new Set(top.flatMap(h => (h.source ? [h.path, h.source] : [h.path])))];
  return { question, anchors: anchorIds, hits: top, sources };
}
