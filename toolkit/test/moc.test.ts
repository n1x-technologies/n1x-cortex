// toolkit/test/moc.test.ts
import { describe, it, expect } from 'vitest';
import { planMoc, applyMoc, renderMoc } from '../src/curate/moc.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-moc-'));
  mkdirSync(join(dir, 'Rules'));
  writeFileSync(join(dir, 'Rules', 'r1.md'), '---\ntype: "rule"\ntags: ["refunds"]\n---\n# Refund window');
  writeFileSync(join(dir, 'Rules', 'r2.md'), '---\ntype: "rule"\ntags: ["refunds"]\n---\n# Refund method');
  writeFileSync(join(dir, 'Rules', 'other.md'), '---\ntype: "rule"\ntags: ["shipping"]\n---\n# Shipping');
  return dir;
}

describe('planMoc', () => {
  it('selects notes by tag and groups them', () => {
    const dir = vault();
    const plan = planMoc(dir, loadConfig(dir, []), 'refunds');
    expect(plan.count).toBe(2);
    expect(plan.dest).toBe('00-MOC/refunds.md');
    expect(renderMoc(plan)).toContain('[[r1|Refund window]]');
  });
});

describe('applyMoc', () => {
  it('dry-runs by default and writes + backs up on --write', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const plan = planMoc(dir, cfg, 'refunds');
    expect(applyMoc(dir, plan, cfg, { dryRun: true }).written).toBe(null);
    expect(existsSync(join(dir, '00-MOC', 'refunds.md'))).toBe(false);

    const first = applyMoc(dir, plan, cfg, { dryRun: false, runId: 'run1' });
    expect(first.written).toBe('00-MOC/refunds.md');
    expect(first.backup).toBe(null);                                   // new file → no backup
    expect(readFileSync(join(dir, '00-MOC', 'refunds.md'), 'utf8')).toContain('type: moc');

    const second = applyMoc(dir, plan, cfg, { dryRun: false, runId: 'run2' });
    expect(second.backup).not.toBe(null);                              // overwrite → backed up
  });
});
