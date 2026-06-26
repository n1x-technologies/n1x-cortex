import { describe, it, expect } from 'vitest';
import { runAtomize, formatPlan } from '../src/commands/atomize.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-acmd-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'rules.md'), '# Rules\n\n## Operation limit\n\nThe limit is 5.');
  return dir;
}

describe('runAtomize', () => {
  it('dry-runs by default (writes nothing) and reports the plan', () => {
    const dir = vault();
    const r = runAtomize(dir, join(dir, 'Markdown', 'rules.md'), {});
    expect(r.plan.dryRun).toBe(true);
    expect(r.written).toEqual([]);
    expect(existsSync(join(dir, '_inbox', 'operation-limit.md'))).toBe(false);
    expect(formatPlan(r)).toMatch(/dry-run|create/i);
  });
  it('writes draft notes with --write', () => {
    const dir = vault();
    const r = runAtomize(dir, join(dir, 'Markdown', 'rules.md'), { write: true });
    expect(r.written.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, '_inbox', 'operation-limit.md'))).toBe(true);
  });
});
