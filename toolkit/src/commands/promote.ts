// toolkit/src/commands/promote.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { planPromote, applyPromote, type PromoteItem } from '../atomize/promote.js';
import { setStatus } from '../atomize/set-status.js';

export function runPromote(vaultDir: string, opts: { write?: boolean }): {
  plan: { items: PromoteItem[] };
  promoted: { from: string; to: string }[];
  skipped: { from: string; reason: string }[];
  dryRun: boolean;
} {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const plan = planPromote(vaultDir, config);
  const { promoted, skipped } = applyPromote(vaultDir, plan, config, { dryRun: !opts.write });
  return { plan, promoted, skipped, dryRun: !opts.write };
}

export function formatPromote(r: ReturnType<typeof runPromote>): string {
  const planned = r.plan.items.filter(i => i.action === 'promote').length;
  const skips = r.plan.items.filter(i => i.action === 'skip').length;
  const lines = [`Promote: ${planned} ready · ${skips} skip`];
  lines.push(r.dryRun ? '(dry-run — nothing moved; pass --write to apply)' : `promoted ${r.promoted.length} note(s)`);
  for (const i of r.plan.items) {
    lines.push(i.action === 'promote' ? `  • ${i.from} → ${i.to}` : `  • ${i.from}  [skip: ${i.reason}]`);
  }
  return lines.join('\n');
}

export function runSetStatus(vaultDir: string, notePath: string, newStatus: string, opts: { write?: boolean }) {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return setStatus(vaultDir, notePath, newStatus, config, { dryRun: !opts.write });
}
