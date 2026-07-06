// toolkit/src/commands/gaps.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { loadState } from '../hooks/state.js';
import { computeGaps, type GapsReport } from '../curate/gaps.js';

export function runGaps(vaultDir: string): GapsReport {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return computeGaps(vaultDir, config, loadState(vaultDir));
}

export function formatGaps(r: GapsReport): string {
  const lines: string[] = [];
  const section = (title: string, items: string[]) => {
    lines.push(`${title}: ${items.length}`);
    for (const i of items.slice(0, 30)) lines.push(`  • ${i}`);
  };
  section('Unatomized sources', r.unatomizedSources);
  section('Stale sources (changed since indexed)', r.staleSources);
  section('Notes missing citation', r.notesMissingCitation);
  section('Stuck drafts', r.stuckDrafts);
  return lines.join('\n');
}
