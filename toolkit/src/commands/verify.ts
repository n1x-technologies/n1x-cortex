// toolkit/src/commands/verify.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { verifyNote, verifyAll, type VerifyReport, type VerifyAllReport } from '../curate/verify.js';

export function runVerify(vaultDir: string, notePath: string, opts: { hops?: number }): VerifyReport {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return verifyNote(vaultDir, config, notePath, opts.hops ?? 2);
}

export function runVerifyAll(vaultDir: string, opts: { hops?: number }): VerifyAllReport {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  // hops=1 by default for a vault-wide sweep — direct-link gaps, fast over hundreds of notes.
  return verifyAll(vaultDir, config, opts.hops ?? 1);
}

export function formatVerifyAll(r: VerifyAllReport): string {
  if (!r.incomplete.length) return `Verify --all: ${r.total} note(s) · 0 with gaps · all OK ✓`;
  const lines = [`Verify --all: ${r.total} note(s) · ${r.incomplete.length} INCOMPLETE (worst first):`];
  for (const n of r.incomplete.slice(0, 50)) {
    lines.push(`  ${String(n.gaps).padStart(3)} gap(s) / ${n.targets} target(s)   ${n.path}`);
  }
  if (r.incomplete.length > 50) lines.push(`  … and ${r.incomplete.length - 50} more`);
  return lines.join('\n');
}

export function formatVerify(r: VerifyReport): string {
  const gaps = r.items.filter(i => !i.exists).length;
  const lines = [`Verify: ${r.root}  ·  ${r.items.length} linked target(s) · ${gaps} gap(s) · ${r.ok ? 'OK' : 'INCOMPLETE'}`];
  for (const i of r.items) {
    const mark = (b: boolean) => (b ? '✓' : '✗');
    lines.push(`  ${mark(i.exists)} exists  ${mark(i.cited)} cited  ${mark(i.verified)} verified   ${i.target}`);
  }
  return lines.join('\n');
}
