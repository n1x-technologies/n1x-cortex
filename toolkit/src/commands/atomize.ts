import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { planAtomize, applyAtomize } from '../atomize/plan.js';
import { emitPlan } from '../atomize/emit.js';
import { applyDistilled } from '../atomize/apply-distilled.js';
import type { AtomizePlan } from '../types.js';

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

export function runApply(vaultDir: string, specsPath: string, opts: { write?: boolean }): { plan: AtomizePlan; written: string[] } {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return applyDistilled(vaultDir, specsPath, config, { dryRun: !opts.write });
}

export function formatDistilledPlan(r: { plan: AtomizePlan; written: string[] }): string {
  const lines: string[] = [];
  const creates = r.plan.items.filter(i => i.action === 'create').length;
  const skips = r.plan.items.filter(i => i.action === 'skip').length;
  lines.push(`Distilled: ${r.plan.source}  ·  ${r.plan.items.length} note(s)  ·  ${creates} create · ${skips} skip`);
  lines.push(r.plan.dryRun ? '(dry-run — nothing written; pass --write to apply)' : `wrote ${r.written.length} draft note(s)`);
  for (const i of r.plan.items) {
    const tag = i.action === 'skip' ? `skip (exists: ${i.matchPath})` : `create → ${i.destPath}`;
    lines.push(`  • ${i.spec.title}  [${i.spec.type ?? 'untyped'}]  [${tag}]`);
  }
  return lines.join('\n');
}
