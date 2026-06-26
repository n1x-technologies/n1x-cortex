// toolkit/test/promote.test.ts
import { describe, it, expect } from 'vitest';
import { planPromote, applyPromote } from '../src/atomize/promote.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-prom-'));
  mkdirSync(join(dir, '03-Rules'));
  mkdirSync(join(dir, '_inbox', '03-Rules'), { recursive: true });
  // ready (status advanced beyond draft)
  writeFileSync(join(dir, '_inbox', '03-Rules', 'ready.md'), '---\ntype: rule\nstatus: "documented"\n---\n# Ready\n\nbody');
  // still a draft → not eligible
  writeFileSync(join(dir, '_inbox', '03-Rules', 'draft.md'), '---\ntype: rule\nstatus: "draft"\n---\n# Draft\n\nbody');
  // ready but the curated destination already exists → skip 'exists'
  writeFileSync(join(dir, '_inbox', '03-Rules', 'dup.md'), '---\ntype: rule\nstatus: "documented"\n---\n# Dup\n\nbody');
  writeFileSync(join(dir, '03-Rules', 'dup.md'), '---\ntype: rule\n---\n# Dup (existing)');
  return dir;
}

describe('planPromote', () => {
  it('marks ready notes promote and others skip with reasons', () => {
    const dir = vault();
    const { items } = planPromote(dir, loadConfig(dir, []));
    const byFrom = Object.fromEntries(items.map(i => [i.from, i]));
    expect(byFrom['_inbox/03-Rules/ready.md']).toEqual({ from: '_inbox/03-Rules/ready.md', to: '03-Rules/ready.md', action: 'promote' });
    expect(byFrom['_inbox/03-Rules/draft.md'].reason).toBe('still-draft');
    expect(byFrom['_inbox/03-Rules/dup.md'].reason).toBe('exists');
  });
});

describe('applyPromote', () => {
  it('dry-runs by default: moves nothing', () => {
    const dir = vault();
    const r = applyPromote(dir, planPromote(dir, loadConfig(dir, [])), loadConfig(dir, []), { dryRun: true });
    expect(r.promoted).toEqual([]);
    expect(existsSync(join(dir, '03-Rules', 'ready.md'))).toBe(false);
    expect(existsSync(join(dir, '_inbox', '03-Rules', 'ready.md'))).toBe(true);
  });

  it('with --write: moves ready note to its curated folder and records the journal', () => {
    const dir = vault();
    const r = applyPromote(dir, planPromote(dir, loadConfig(dir, [])), loadConfig(dir, []), { dryRun: false, runId: 'RUN1' });
    expect(r.promoted).toEqual([{ from: '_inbox/03-Rules/ready.md', to: '03-Rules/ready.md' }]);
    expect(readFileSync(join(dir, '03-Rules', 'ready.md'), 'utf8')).toContain('# Ready');
    expect(existsSync(join(dir, '_inbox', '03-Rules', 'ready.md'))).toBe(false); // moved, not copied
    expect(existsSync(join(dir, '.cortex/promotions/RUN1.json'))).toBe(true);     // journal written
    // idempotent: re-plan now finds nothing to promote
    expect(planPromote(dir, loadConfig(dir, [])).items.some(i => i.action === 'promote')).toBe(false);
  });
});
