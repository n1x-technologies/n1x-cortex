import { describe, it, expect } from 'vitest';
import { planDoc, renderDocTyp, runDoc } from '../src/curate/doc.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-doc-'));
  mkdirSync(join(dir, 'Rules'));
  writeFileSync(join(dir, 'Rules', 'r1.md'), '---\ntype: "rule"\ntags: ["refunds"]\n---\n# Refund window\n\nThirty days.');
  return dir;
}

describe('planDoc + renderDocTyp', () => {
  it('selects topic notes and emits a valid .typ', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const plan = planDoc(dir, cfg, 'refunds');
    expect(plan.notes.length).toBe(1);
    const typ = renderDocTyp(plan, cfg);
    expect(typ).toContain('#import "template.typ": *');
    expect(typ).toContain('doc.with(');
    expect(typ).toContain('= Refund window');
  });
});

describe('runDoc', () => {
  it('writes the .typ and template files into outDir (no --pdf → not compiled)', () => {
    const dir = vault();
    const r = runDoc(dir, 'refunds', { pdf: false });
    expect(r.compiled).toBe(false);
    expect(r.pdf).toBe(null);
    expect(existsSync(join(dir, '.cortex', 'out', 'refunds.typ'))).toBe(true);
    expect(existsSync(join(dir, '.cortex', 'out', 'template.typ'))).toBe(true);
    expect(readFileSync(join(dir, '.cortex', 'out', 'refunds.typ'), 'utf8')).toContain('= Refund window');
  });
});
