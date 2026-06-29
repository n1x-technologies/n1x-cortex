// toolkit/test/new.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNew } from '../src/commands/new.js';
import { fillTemplate, resolveTypeDir } from '../src/new.js';
import { undoLatestRun } from '../src/atomize/backup.js';
import type { Note } from '../src/types.js';

const TEMPLATE = '---\ntype: CON\nid: {{id}}\nmodule: {{module}}\nstatus: {{status}}\ncreated: {{date}}\n---\n# {{title}}\n\n';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-new-'));
  mkdirSync(join(dir, '_templates'));
  writeFileSync(join(dir, '_templates', 'CON.md'), TEMPLATE);
  // an existing CON note so the destination folder can be learned
  mkdirSync(join(dir, '01-Conceptos'));
  writeFileSync(join(dir, '01-Conceptos', 'existing.md'), '---\ntype: CON\nid: existing\n---\n# Existing\n');
  return dir;
}

describe('fillTemplate', () => {
  it('substitutes the standard tokens and leaves unknown ones alone', () => {
    const out = fillTemplate('{{id}}/{{title}}/{{module}}/{{date}}/{{status}}/{{nope}}', {
      id: 'X-1', title: 'Hello', module: 'core', date: '2026-06-27', status: 'draft',
    });
    expect(out).toBe('X-1/Hello/core/2026-06-27/draft/{{nope}}');
  });
});

describe('resolveTypeDir', () => {
  const notes = [
    { path: '01-Conceptos/a.md', type: 'CON' },
    { path: '01-Conceptos/b.md', type: 'CON' },
    { path: 'other/c.md', type: 'CON' },
    { path: 'mvp/d.md', type: 'MVP' },
  ] as Note[];
  it('picks the most common folder for the type', () => {
    expect(resolveTypeDir(notes, 'CON')).toBe('01-Conceptos');
  });
  it('honors an explicit override', () => {
    expect(resolveTypeDir(notes, 'CON', 'custom')).toBe('custom');
  });
  it('returns null when no note of that type exists', () => {
    expect(resolveTypeDir(notes, 'FLJ')).toBeNull();
  });
});

describe('runNew', () => {
  it('scaffolds a note in the learned folder with filled frontmatter', () => {
    const dir = vault();
    const r = runNew(dir, 'CON', 'CON-99', { title: 'My concept', module: 'core', date: '2026-06-27' });
    expect(r.created).toBe(true);
    expect(r.path).toBe('01-Conceptos/CON-99.md');
    const content = readFileSync(join(dir, r.path!), 'utf8');
    expect(content).toContain('id: CON-99');
    expect(content).toContain('module: core');
    expect(content).toContain('status: draft');
    expect(content).toContain('# My concept');
    expect(content).toContain('created: 2026-06-27');
  });

  it('is reversible — cortex undo deletes the created note', () => {
    const dir = vault();
    const r = runNew(dir, 'CON', 'CON-undo', {});
    const abs = join(dir, r.path!);
    expect(existsSync(abs)).toBe(true);
    const { reverted } = undoLatestRun(dir);
    expect(reverted).toContain(r.path);
    expect(existsSync(abs)).toBe(false);
  });

  it('refuses to overwrite an existing id', () => {
    const dir = vault();
    const r = runNew(dir, 'CON', 'existing', {});
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/already exists/);
  });

  it('errors when the template is missing', () => {
    const dir = vault();
    const r = runNew(dir, 'MVP', 'MVP-1', {});
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/no template/);
  });

  it('asks for --dir when the folder cannot be inferred', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-new-empty-'));
    mkdirSync(join(dir, '_templates'));
    writeFileSync(join(dir, '_templates', 'CON.md'), TEMPLATE);
    const r = runNew(dir, 'CON', 'CON-1', {});
    expect(r.created).toBe(false);
    expect(r.reason).toMatch(/--dir/);
  });

  it('uses --dir to place the first note of a new type', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-new-dir-'));
    mkdirSync(join(dir, '_templates'));
    writeFileSync(join(dir, '_templates', 'CON.md'), TEMPLATE);
    const r = runNew(dir, 'CON', 'CON-1', { dir: 'concepts' });
    expect(r.created).toBe(true);
    expect(r.path).toBe('concepts/CON-1.md');
    expect(existsSync(join(dir, 'concepts', 'CON-1.md'))).toBe(true);
  });
});
