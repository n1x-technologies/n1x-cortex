import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { buildGraph } from '../graph.js';

export function runStatus(vaultDir: string): {
  total: number; byType: Record<string, number>; byStatus: Record<string, number>; orphans: number;
} {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const n of notes) {
    if (n.type) byType[n.type] = (byType[n.type] ?? 0) + 1;
    if (n.status) byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
  }
  return { total: notes.length, byType, byStatus, orphans: buildGraph(notes).orphans.length };
}
