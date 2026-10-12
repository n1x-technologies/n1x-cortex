import { buildIndex, searchIndex } from '../search/index.js';
import { excerpt, bestLine } from './excerpt.js';
import { rrfOrder } from '../semantic/fuse.js';
import type { Note, Graph, QueryResult, QueryHit } from '../types.js';

/**
 * The line shown for a hit.
 *
 * A line that shares words with the question wins over the passage the model
 * picked, and the window is used only when no line shares any. That order comes
 * from measuring it the other way round first: on a long document the model
 * scores every passage within about two hundredths of the top one, so which one
 * "won" is close to arbitrary, and citing inside that window threw away a line
 * elsewhere in the document that actually contained the question's words.
 *
 * The window still earns its place for the case `bestLine` cannot serve: when
 * nothing in the note shares a word with the question, the alternative is the
 * document's first line, which in a long import is its cover page.
 */
function cite(note: Note, question: string, window?: { start: number; end: number }): string {
  const direct = bestLine(note.body, question);
  if (direct !== null) return direct;
  if (!window) return excerpt(note.body, question);
  const { start, end } = window;
  // A window from a stale store could point outside the body it was measured
  // on. Citing the whole note is worse than ideal; citing out of bounds is a
  // crash or a lie.
  if (!(end > start) || start < 0 || start >= note.body.length) return excerpt(note.body, question);
  return excerpt(note.body.slice(start, Math.min(end, note.body.length)), question);
}

export function retrieve(
  notes: Note[],
  graph: Graph,
  question: string,
  opts: {
    maxAnchors?: number;
    hops?: number;
    maxHits?: number;
    semanticRanking?: string[];
    rrfK?: number;
    /** Attach the note body to each returned hit: a character cap, or 'full'. */
    content?: number | 'full';
    /**
     * For the notes that ranked on a passage, where that passage sits.
     *
     * Used only as a fallback for the citation. Without it, a two-hundred
     * thousand character document is cited from wherever the first matching
     * line happens to be, which in a document that long may be another section
     * mentioning the same word.
     */
    windows?: Map<string, { start: number; end: number }>;
  } = {},
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

  const lexicalIds = ranked.map(r => notes[r.index].id);
  const order = opts.semanticRanking && opts.semanticRanking.length
    ? rrfOrder([lexicalIds, opts.semanticRanking], opts.rrfK ?? 60)
    : lexicalIds;
  const anchorIds = order.filter(id => byId.has(id)).slice(0, maxAnchors);
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
      excerpt: cite(note, question, opts.windows?.get(id)),
      source: note.source,
      via: anchorSet.has(id) ? 'anchor' : 'link',
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, maxHits);

  // Attached AFTER the slice, never before: `content` can be the entire note,
  // and building it for every candidate only to discard all but `maxHits` of
  // them would make `--full` cost the whole vault on a large one.
  if (opts.content !== undefined) {
    for (const h of top) {
      const body = byId.get(h.id)?.body ?? '';
      h.content = opts.content === 'full' ? body : body.slice(0, opts.content);
    }
  }

  const sources = [...new Set(top.flatMap(h => (h.source ? [h.path, h.source] : [h.path])))];
  return { question, anchors: anchorIds, hits: top, sources };
}
