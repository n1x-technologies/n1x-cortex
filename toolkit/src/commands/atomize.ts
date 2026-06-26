import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { planAtomize, applyAtomize } from '../atomize/plan.js';
import { emitPlan } from '../atomize/emit.js';
import { applyDistilled } from '../atomize/apply-distilled.js';
import { undoLatestRun } from '../atomize/backup.js';
import type { AtomizePlan, DistilledApplyResult } from '../types.js';

export function runAtomize(vaultDir: string, sourcePath: string, opts: { write?: boolean }): { plan: AtomizePlan; written: string[] } {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const plan = planAtomize(vaultDir, sourcePath, config, { dryRun: !opts.write });
  const { written } = applyAtomize(vaultDir, plan);
  return { plan, written };
}

export function formatPlan(r: { plan: AtomizePlan; written: string[] }): string {
  const lines: string[] = [];
  const creates = r.plan.items.filter(i => i.action === 'create').length;
  const skips = r.plan.items.filter(i => i.action === 'skip').length;
  lines.push(`Source: ${r.plan.source}  ·  ${r.plan.items.length} segments  ·  ${creates} create · ${skips} skip`);
  lines.push(r.plan.dryRun ? '(dry-run — nothing written; pass --write to apply)' : `wrote ${r.written.length} draft note(s)`);
  for (const i of r.plan.items) {
    const tag = i.action === 'skip' ? `skip (exists: ${i.matchPath})` : `create → ${i.destPath}`;
    lines.push(`  • ${i.spec.title}  [${tag}]`);
  }
  return lines.join('\n');
}

export function runEmit(vaultDir: string, sourcePath: string): string {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return JSON.stringify(emitPlan(vaultDir, sourcePath, config), null, 2);
}

export function runApply(vaultDir: string, specsPath: string, opts: { write?: boolean; force?: boolean }): DistilledApplyResult {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return applyDistilled(vaultDir, specsPath, config, { dryRun: !opts.write, force: opts.force });
}

export function runUndo(vaultDir: string): { restored: string[]; reverted: string[] } {
  return undoLatestRun(vaultDir);
}

export function formatDistilledPlan(r: DistilledApplyResult): string {
  const lines: string[] = [];
  const creates = r.plan.items.filter(i => i.action === 'create').length;
  const updates = r.plan.items.filter(i => i.action === 'update').length;
  const skips = r.plan.items.filter(i => i.action === 'skip').length;
  lines.push(`Distilled: ${r.plan.source}  ·  ${r.plan.items.length} note(s)  ·  ${creates} create · ${updates} update · ${skips} skip`);
  lines.push(r.plan.dryRun
    ? '(dry-run — nothing written; pass --write to apply)'
    : `wrote ${r.written.length} draft(s), updated ${r.updated.length} note(s)`);
  for (const i of r.plan.items) {
    const tag = i.action === 'skip' ? `skip (exists: ${i.matchPath})`
      : i.action === 'update' ? `update → ${i.destPath}`
      : `create → ${i.destPath}`;
    lines.push(`  • ${i.spec.title}  [${i.spec.type ?? 'untyped'}]  [${tag}]`);
  }
  if (r.skipped.length) lines.push(`Skipped (not applied): ${r.skipped.map(s => `${s.target} (${s.reason})`).join(', ')}`);
  return lines.join('\n');
}
