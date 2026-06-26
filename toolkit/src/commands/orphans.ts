import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { buildGraph } from '../graph.js';

export interface OrphanReport {
  gaps: { target: string; refs: number }[];
  sources: { target: string; refs: number }[];
}

export function runOrphans(vaultDir: string): OrphanReport {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);
  const sourceTargets = new Set(notes.map(n => n.source).filter((s): s is string => !!s));
  const counts = new Map<string, number>();
  for (const t of graph.orphans) counts.set(t, 0);
  for (const e of graph.edges) {
    if (counts.has(e.to)) counts.set(e.to, (counts.get(e.to) ?? 0) + 1);
  }
  const sort = (a: { target: string; refs: number }, b: { target: string; refs: number }) =>
    b.refs - a.refs || a.target.localeCompare(b.target);
  const all = [...counts.entries()].map(([target, refs]) => ({ target, refs }));
  return {
    gaps: all.filter(o => !sourceTargets.has(o.target)).sort(sort),
    sources: all.filter(o => sourceTargets.has(o.target)).sort(sort),
  };
}
