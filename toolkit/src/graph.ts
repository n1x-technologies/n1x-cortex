import type { Note, Graph, GraphNode, GraphEdge } from './types.js';

function basename(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

/**
 * Build the note graph.
 *
 * Link-target resolution precedence: an exact `id` match wins over a `title`
 * or filename-basename match. Among aliases of the same kind, the later note
 * in `notes` wins. Targets resolving to no note become orphans (deduped,
 * first-seen order) and get a non-existing GraphNode (`exists: false`); an
 * edge to the raw target is still recorded.
 */
export function buildGraph(notes: Note[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const resolve = new Map<string, string>(); // alias -> canonical note id

  for (const n of notes) {
    nodes.set(n.id, { key: n.id, note: n, exists: true });
  }
  // weaker aliases first (title, basename) ...
  for (const n of notes) {
    for (const alias of [n.title, basename(n.path)]) {
      if (alias) resolve.set(alias, n.id);
    }
  }
  // ... then id, so an exact id match always takes precedence.
  for (const n of notes) {
    if (n.id) resolve.set(n.id, n.id);
  }

  const edges: GraphEdge[] = [];
  const orphanSet = new Set<string>();

  for (const n of notes) {
    for (const link of n.links) {
      const canonical = resolve.get(link.target);
      if (canonical) {
        edges.push({ from: n.id, to: canonical, heading: link.heading });
      } else {
        if (!nodes.has(link.target)) nodes.set(link.target, { key: link.target, note: null, exists: false });
        orphanSet.add(link.target);
        edges.push({ from: n.id, to: link.target, heading: link.heading });
      }
    }
  }

  return { nodes, edges, orphans: [...orphanSet] };
}
