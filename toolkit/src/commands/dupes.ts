// toolkit/src/commands/dupes.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { computeDupes, type DupePair } from '../curate/dupes.js';

export function runDupes(vaultDir: string, opts: { threshold?: number }): DupePair[] {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return computeDupes(vaultDir, config, opts.threshold ?? config.dupeThreshold);
}

export function formatDupes(pairs: DupePair[]): string {
  if (!pairs.length) return 'No near-duplicate notes found.';
  const lines = [`Near-duplicate pairs (merge candidates): ${pairs.length}`];
  for (const p of pairs.slice(0, 50)) lines.push(`  ${p.score.toFixed(2)}  ${p.a}  ⇄  ${p.b}`);
  return lines.join('\n');
}
