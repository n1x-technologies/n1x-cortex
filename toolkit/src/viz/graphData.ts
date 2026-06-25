import { statSync } from 'node:fs';
import { join } from 'node:path';
import { scanVault } from '../vault.js';
import { buildGraph } from '../graph.js';
import { computeFreshness } from './freshness.js';
import type { CortexConfig, Note, ViewerData, VizNode, VizEdge } from '../types.js';

function mtime(path: string): number | null {
  try { return statSync(path).mtimeMs; } catch { return null; }
}

// Best-effort: locate the source note's file under sourcesDir by matching its basename to `source`.
function sourceMtime(vaultDir: string, sourcesDir: string, source: string | null, byBasename: Map<string, string>): number | null {
  if (!source) return null;
  const rel = byBasename.get(source);
  if (!rel) return null;
  return mtime(join(vaultDir, rel));
}

export function buildGraphData(vaultDir: string, config: CortexConfig): ViewerData {
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);

  const draftStatus = config.statusLifecycle[0] ?? null;
  const verifiedStatus = config.statusLifecycle[config.statusLifecycle.length - 1] ?? null;

  // index notes by id for note lookup, and a basename map over the sources dir for stale detection
  const byId = new Map<string, Note>();
  for (const n of notes) byId.set(n.id, n);

  // map of source-file basenames → their vault-relative path (sources live under sourcesDir)
  const sourcesBase = new Map<string, string>();
  // (sources are excluded from scanVault, so we re-walk lightly is overkill; instead, accept that a
  //  source note inside the graph counts too — match any note id to its path)
  for (const n of notes) sourcesBase.set(n.id, n.path);

  // degree per node id
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const nodes: VizNode[] = [];
  for (const gn of graph.nodes.values()) {
    const note = gn.note;
    let stale = false;
    if (note && note.source) {
      const sm = sourceMtime(vaultDir, config.sourcesDir, note.source, sourcesBase);
      const nm = mtime(join(vaultDir, note.path));
      stale = sm != null && nm != null && sm > nm;
    }
    const title = note ? note.title : gn.key;
    nodes.push({
      id: title,
      title,
      type: note ? note.type : null,
      status: note ? note.status : null,
      folder: note ? note.folder : '',
      exists: gn.exists,
      degree: degree.get(gn.key) ?? 0,
      freshness: computeFreshness({ exists: gn.exists, stale, status: note ? note.status : null, draftStatus, verifiedStatus }),
    });
  }

  // Build a map from graph node key to viz node id (title) for edge references
  const keyToVizId = new Map<string, string>();
  for (const gn of graph.nodes.values()) {
    const title = gn.note ? gn.note.title : gn.key;
    keyToVizId.set(gn.key, title);
  }

  const edges: VizEdge[] = graph.edges.map(e => ({
    source: keyToVizId.get(e.from) ?? e.from,
    target: keyToVizId.get(e.to) ?? e.to,
    context: null,
    dangling: graph.nodes.get(e.to)?.exists === false,
  }));

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let draftsPending = 0;
  let missingCitations = 0;
  for (const n of notes) {
    if (n.type) byType[n.type] = (byType[n.type] ?? 0) + 1;
    if (n.status) byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
    if (draftStatus && n.status === draftStatus) draftsPending++;
    if (!n.source) missingCitations++;
  }

  return {
    nodes,
    edges,
    stats: { total: notes.length, byType, byStatus, orphans: graph.orphans.length, draftsPending, missingCitations },
    lang: config.lang,
    generatedAt: mtime(vaultDir) ?? 0,
  };
}
