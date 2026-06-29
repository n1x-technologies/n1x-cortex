// toolkit/src/commands/merge.ts
import { readFileSync } from 'node:fs';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { runMergeNotes, type MergeResult } from '../curate/merge.js';

/**
 * Merge a near-duplicate pair: keep `keepPath`, fold `dropPath` into it using the
 * AI-produced merged file at `contentFile`, redirect inbound links, delete the drop.
 * Dry-run by default; reversible with `cortex undo` when written.
 */
export function runMerge(
  vaultDir: string,
  keepPath: string,
  dropPath: string,
  contentFile: string,
  opts: { write?: boolean } = {},
): MergeResult {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const content = readFileSync(contentFile, 'utf8');
  return runMergeNotes(vaultDir, config, { keepPath, dropPath, content }, opts);
}

export function formatMerge(r: MergeResult): string {
  if (r.skipped) return `Merge skipped (${r.skipped.reason}).`;
  const head = r.dryRun
    ? `Merge plan (dry-run): keep ${r.keep} · drop ${r.dropped}`
    : `Merged: kept ${r.keep} · dropped ${r.dropped}`;
  const lines = [head];
  if (r.redirected.length) lines.push(`  redirected ${r.redirected.length} linking note(s): ${r.redirected.join(', ')}`);
  else lines.push('  no inbound links to redirect');
  if (r.dryRun) lines.push('  (pass --write to apply; reversible with `cortex undo`)');
  else lines.push(`  ${r.backups.length} backup(s) saved — reverse with \`cortex undo\``);
  return lines.join('\n');
}
