// toolkit/src/commands/verify.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { verifyNote, type VerifyReport } from '../curate/verify.js';

export function runVerify(vaultDir: string, notePath: string, opts: { hops?: number }): VerifyReport {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return verifyNote(vaultDir, config, notePath, opts.hops ?? 2);
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
