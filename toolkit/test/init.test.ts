// toolkit/test/init.test.ts
//
// `cortex new` was a first-run dead end: a freshly `init`ed vault had no
// `_templates/`, so `new` failed with "no template". init now seeds a generic
// starter template (matching the vault's inferred field names) so
// `cortex new note <id> --dir <folder>` works immediately after init.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init.js';
import { runNew } from '../src/commands/new.js';

function emptyVault(): string {
  return mkdtempSync(join(tmpdir(), 'cortex-init-'));
}

describe('runInit — starter template scaffolding', () => {
  it('seeds _templates/note.md on a fresh vault', () => {
    const dir = emptyVault();
    const r = runInit(dir);
    expect(r.created).toBe(true);
    expect(r.templateSeeded).toBe(true);
    const tpl = join(dir, '_templates', 'note.md');
    expect(existsSync(tpl)).toBe(true);
    const content = readFileSync(tpl, 'utf8');
    // keeps the placeholder tokens for `cortex new` to fill, and the type value
    // matches the filename so `cortex new note <id>` resolves it.
    expect(content).toContain('type: note');
    expect(content).toContain('{{id}}');
    expect(content).toContain('{{title}}');
    expect(content).toContain('{{status}}');
  });

  it('the seeded template makes `cortex new note <id> --dir` work right after init', () => {
    const dir = emptyVault();
    runInit(dir);
    const r = runNew(dir, 'note', 'my-first', { dir: 'notes', date: '2026-07-06' });
    expect(r.created).toBe(true);
    expect(r.path).toBe('notes/my-first.md');
    const md = readFileSync(join(dir, r.path!), 'utf8');
    expect(md).toContain('type: note');
    expect(md).toContain('status: draft');
    expect(md).toContain('# my-first');
  });

  it('does not overwrite an existing template dir (idempotent, no clobber)', () => {
    const dir = emptyVault();
    mkdirSync(join(dir, '_templates'));
    writeFileSync(join(dir, '_templates', 'CON.md'), '---\ntype: CON\nid: {{id}}\n---\n');
    const r = runInit(dir);
    expect(r.templateSeeded).toBe(false);
    // did not add note.md alongside the user's existing template
    expect(existsSync(join(dir, '_templates', 'note.md'))).toBe(false);
    expect(readFileSync(join(dir, '_templates', 'CON.md'), 'utf8')).toContain('type: CON');
  });

  it('re-running init does not re-seed or overwrite the seeded template', () => {
    const dir = emptyVault();
    runInit(dir);
    writeFileSync(join(dir, '_templates', 'note.md'), 'EDITED');
    const r = runInit(dir);
    expect(r.templateSeeded).toBe(false);
    expect(readFileSync(join(dir, '_templates', 'note.md'), 'utf8')).toBe('EDITED');
  });
});
