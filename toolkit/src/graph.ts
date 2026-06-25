import type { Note, Graph, GraphNode, GraphEdge } from './types.js';

function basename(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

export function buildGraph(notes: Note[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const resolve = new Map<string, string>(); // alias key -> canonical key (the note id)

  for (const n of notes) {
    const key = n.id;
    nodes.set(key, { key, note: n, exists: true });
    for (const alias of [n.id, n.title, basename(n.path)]) {
      if (alias) resolve.set(alias, key);
    }
  }

  const edges: GraphEdge[] = [];
  const orphans: string[] = [];

  for (const n of notes) {
    for (const link of n.links) {
      const canonical = resolve.get(link.target);
      if (canonical) {
        edges.push({ from: n.id, to: canonical, heading: link.heading });
      } else {
        if (!nodes.has(link.target)) nodes.set(link.target, { key: link.target, note: null, exists: false });
        if (!orphans.includes(link.target)) orphans.push(link.target);
        edges.push({ from: n.id, to: link.target, heading: link.heading });
      }
    }
  }

  return { nodes, edges, orphans };
}
