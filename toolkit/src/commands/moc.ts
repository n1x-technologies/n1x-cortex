// toolkit/src/commands/moc.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { planMoc, applyMoc, type MocPlan } from '../curate/moc.js';

export function runMoc(vaultDir: string, topic: string, opts: { write?: boolean }): {
  plan: MocPlan; written: string | null; backup: string | null; dryRun: boolean;
} {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const plan = planMoc(vaultDir, config, topic);
  const { written, backup } = applyMoc(vaultDir, plan, config, { dryRun: !opts.write });
  return { plan, written, backup, dryRun: !opts.write };
}

export function formatMoc(r: ReturnType<typeof runMoc>): string {
  const lines = [`MOC: ${r.plan.topic}  ·  ${r.plan.count} note(s) · ${r.plan.groups.length} group(s) → ${r.plan.dest}`];
  lines.push(r.dryRun ? '(dry-run — nothing written; pass --write to apply)'
    : `wrote ${r.written}${r.backup ? ` (backed up prior version)` : ''}`);
  for (const g of r.plan.groups) lines.push(`  ## ${g.name} (${g.entries.length})`);
  return lines.join('\n');
}
