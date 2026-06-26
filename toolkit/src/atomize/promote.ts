// toolkit/src/atomize/promote.ts
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { scanVault } from '../vault.js';
import { recordPromotions } from './backup.js';
import type { CortexConfig } from '../types.js';

const INBOX = '_inbox';

export interface PromoteItem { from: string; to: string; action: 'promote' | 'skip'; reason?: string }

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function planPromote(vaultDir: string, config: CortexConfig): { items: PromoteItem[] } {
  const draft = config.statusLifecycle[0] ?? 'draft';
  const items: PromoteItem[] = scanVault(vaultDir, config)
    .filter(n => n.folder === INBOX)
    .map(n => {
      if (!n.status || n.status === draft) return { from: n.path, to: '', action: 'skip', reason: 'still-draft' };
      const rest = n.path.slice(`${INBOX}/`.length);
      if (!rest.includes('/')) return { from: n.path, to: '', action: 'skip', reason: 'no-target-folder' };
      if (existsSync(join(vaultDir, rest))) return { from: n.path, to: rest, action: 'skip', reason: 'exists' };
      return { from: n.path, to: rest, action: 'promote' };
    });
  return { items };
}

export function applyPromote(
  vaultDir: string,
  plan: { items: PromoteItem[] },
  config: CortexConfig,
  opts: { dryRun?: boolean; runId?: string } = {},
): { promoted: { from: string; to: string }[]; skipped: { from: string; reason: string }[] } {
  const dryRun = opts.dryRun ?? true;
  const runId = opts.runId ?? makeRunId();
  const vaultAbs = resolve(vaultDir);
  const sourcesAbs = resolve(vaultDir, config.sourcesDir.replace(/\/$/, ''));
  const promoted: { from: string; to: string }[] = [];
  const skipped: { from: string; reason: string }[] = [];
  const moves: { from: string; to: string }[] = [];

  for (const item of plan.items) {
    if (item.action !== 'promote') { skipped.push({ from: item.from, reason: item.reason ?? 'skip' }); continue; }
    const toAbs = resolve(vaultDir, item.to);
    if (toAbs === vaultAbs || !toAbs.startsWith(vaultAbs + sep)) { skipped.push({ from: item.from, reason: 'outside-vault' }); continue; }
    if (toAbs === sourcesAbs || toAbs.startsWith(sourcesAbs + sep)) { skipped.push({ from: item.from, reason: 'source-immutable' }); continue; }
    if (!dryRun) {
      const fromAbs = join(vaultDir, item.from);
      mkdirSync(dirname(toAbs), { recursive: true });
      writeFileSync(toAbs, readFileSync(fromAbs));
      rmSync(fromAbs);
      moves.push({ from: item.from, to: item.to });
      promoted.push({ from: item.from, to: item.to });
    }
  }
  if (!dryRun && moves.length) recordPromotions(vaultDir, moves, runId);
  return { promoted, skipped };
}
