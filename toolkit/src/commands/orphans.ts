import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { buildGraph } from '../graph.js';

export function runOrphans(vaultDir: string): { target: string; refs: number }[] {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const graph = buildGraph(scanVault(vaultDir, config));
  const counts = new Map<string, number>();
  for (const t of graph.orphans) counts.set(t, 0);
  for (const e of graph.edges) {
    if (counts.has(e.to)) counts.set(e.to, (counts.get(e.to) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([target, refs]) => ({ target, refs }))
    .sort((a, b) => b.refs - a.refs || a.target.localeCompare(b.target));
}
