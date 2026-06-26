import { describe, it, expect } from 'vitest';
import { renderNote, planAtomize, applyAtomize } from '../src/atomize/plan.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NoteSpec } from '../src/types.js';

const spec: NoteSpec = { id: 'op-limit', title: 'Operation limit', type: null,
  body: 'The limit is 5.', source: 'FUENTE-rules', status: 'draft', folder: null };

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-atom-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'rules.md'), '# Rules\n\n## Operation limit\n\nThe limit is 5.\n\n## Other rule\n\nText.');
  return dir;
}

describe('renderNote', () => {
  it('emits frontmatter, title, body and a source citation', () => {
    // DEVIATION: use [] (no sample keys) so field names default to type/status/id/source
    // — guarantees /id: op-limit/ and /status: draft/ assertions pass.
    const cfg = loadConfig(mkdtempSync(join(tmpdir(), 'c-')), []);
    const md = renderNote(spec, cfg);
    expect(md).toMatch(/^---/);
    expect(md).toMatch(/id: op-limit/);
    expect(md).toMatch(/status: "draft"/);
    expect(md).toMatch(/# Operation limit/);
    expect(md).toMatch(/The limit is 5\./);
    expect(md).toMatch(/\[\[FUENTE-rules\]\]/);
  });
});

describe('planAtomize / applyAtomize', () => {
  it('defaults to dryRun:true when no opts object is passed', () => {
    const dir = vault();
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    const plan = planAtomize(dir, join(dir, 'Markdown', 'rules.md'), cfg);
    expect(plan.dryRun).toBe(true);
  });
  it('plans creates as a dry-run and writes nothing', () => {
    const dir = vault();
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    const plan = planAtomize(dir, join(dir, 'Markdown', 'rules.md'), cfg, { dryRun: true });
    expect(plan.dryRun).toBe(true);
    expect(plan.items.map(i => i.action)).toEqual(['create', 'create', 'create']);
    const res = applyAtomize(dir, plan);
    expect(res.written).toEqual([]);                           // dry-run writes nothing
  });
  it('writes draft notes only when dryRun is false, and is idempotent', () => {
    const dir = vault();
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    const plan = planAtomize(dir, join(dir, 'Markdown', 'rules.md'), cfg, { dryRun: false });
    const res = applyAtomize(dir, plan);
    expect(res.written.length).toBe(3);
    expect(res.written.every(p => p.startsWith('_inbox/'))).toBe(true);
    expect(existsSync(join(dir, res.written[0]))).toBe(true);
    // re-plan: existing notes now reconcile to skip
    const notes2 = readdirSync(dir);
    const plan2 = planAtomize(dir, join(dir, 'Markdown', 'rules.md'), cfg, { dryRun: false });
    expect(plan2.items.every(i => i.action === 'skip')).toBe(true);
    expect(notes2.length).toBeGreaterThan(0);
  });
});
