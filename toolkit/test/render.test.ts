import { describe, it, expect } from 'vitest';
import { renderNote, planAtomize, applyAtomize } from '../src/atomize/plan.js';
import { renderUpdatedNote } from '../src/atomize/render.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NoteSpec, AtomizePlan } from '../src/types.js';

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
  it('emits a tags line when the spec carries tags, and omits it otherwise', () => {
    const cfg = loadConfig(mkdtempSync(join(tmpdir(), 'c-')), []);
    const withTags = renderNote({ ...spec, tags: ['rule', 'limit'] }, cfg);
    expect(withTags).toMatch(/tags: \[rule, limit\]/);
    const noTags = renderNote(spec, cfg);
    expect(noTags).not.toMatch(/tags:/);
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
  it('applyAtomize skips a plan item whose destPath traverses outside _inbox/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-traverse-'));
    const escapedFile = join(dir, 'escape.md');
    const plan: AtomizePlan = {
      source: 'test',
      dryRun: false,
      items: [
        {
          spec: { ...spec, id: 'escape' },
          action: 'create',
          matchPath: null,
          destPath: '_inbox/../escape.md',
        },
      ],
    };
    const res = applyAtomize(dir, plan);
    expect(res.written).not.toContain('_inbox/../escape.md');
    expect(res.written.length).toBe(0);
    expect(existsSync(escapedFile)).toBe(false);
  });

  it('de-collision: two headings with identical slugs get distinct destPaths and both files are written', () => {
    // '## Summary' appears twice → slug('Summary') = 'summary' both times → collision without fix
    const dir = mkdtempSync(join(tmpdir(), 'cortex-collide-'));
    mkdirSync(join(dir, 'Markdown'));
    writeFileSync(
      join(dir, 'Markdown', 'collide.md'),
      '## Summary\n\nFirst summary content.\n\n## Summary\n\nSecond summary content.\n',
    );
    const cfg = loadConfig(dir, []);
    const plan = planAtomize(dir, join(dir, 'Markdown', 'collide.md'), cfg, { dryRun: false });
    const res = applyAtomize(dir, plan);
    // Both segments must be written as distinct files
    expect(res.written.length).toBe(2);
    expect(new Set(res.written).size).toBe(2);
    expect(res.written.every(p => p.startsWith('_inbox/'))).toBe(true);
    // One path ends with '-2.md' (the colliding entry gets a suffix)
    expect(res.written.some(p => p.endsWith('-2.md'))).toBe(true);
    // Both files must actually exist on disk
    expect(existsSync(join(dir, res.written[0]))).toBe(true);
    expect(existsSync(join(dir, res.written[1]))).toBe(true);
  });
});

describe('renderUpdatedNote', () => {
  const existing = '---\ntype: concept\nid: x\ncustom: keep-me\n---\n# Title\n\nold body\n\n*Source: [[a]]*\n';

  it('keeps the frontmatter block verbatim and replaces the body', () => {
    const out = renderUpdatedNote(existing, '# Title\n\nmerged body', 'a');
    expect(out).toMatch(/^---\ntype: concept\nid: x\ncustom: keep-me\n---/); // frontmatter byte-stable
    expect(out).toContain('merged body');
    expect(out).not.toContain('old body');
  });

  it('appends the source citation only when the merged body lacks it', () => {
    const without = renderUpdatedNote(existing, '# Title\n\nmerged body', 'b');
    expect(without).toContain('*Source: [[b]]*');                       // new source appended
    const withIt = renderUpdatedNote(existing, '# Title\n\nbody cites [[b]] already', 'b');
    expect(withIt.match(/\[\[b\]\]/g)?.length).toBe(1);                 // not duplicated
  });
});
