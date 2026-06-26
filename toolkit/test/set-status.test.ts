// toolkit/test/set-status.test.ts
import { describe, it, expect } from 'vitest';
import { setStatus } from '../src/atomize/set-status.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-ss-'));
  mkdirSync(join(dir, '01-Concepts'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, '01-Concepts', 'n.md'), '---\ntype: concept\nid: n\nstatus: "draft"\n---\n# N\n\nbody\n');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# src');
  return dir;
}

describe('setStatus', () => {
  it('dry-runs by default: no write, no backup', () => {
    const dir = vault();
    const r = setStatus(dir, '01-Concepts/n.md', 'documented', loadConfig(dir, []), { dryRun: true });
    expect(r.changed).toBeNull();
    expect(existsSync(join(dir, '.cortex'))).toBe(false);
    expect(readFileSync(join(dir, '01-Concepts', 'n.md'), 'utf8')).toContain('status: "draft"');
  });

  it('patches only the status line and backs up (rest of frontmatter verbatim)', () => {
    const dir = vault();
    const r = setStatus(dir, '01-Concepts/n.md', 'documented', loadConfig(dir, []), { dryRun: false, runId: 'RUN1' });
    expect(r.changed).toBe('01-Concepts/n.md');
    expect(r.backup).toBe('.cortex/backups/RUN1/01-Concepts/n.md');
    const after = readFileSync(join(dir, '01-Concepts', 'n.md'), 'utf8');
    expect(after).toContain('status: "documented"');
    expect(after).not.toContain('status: "draft"');
    expect(after).toMatch(/type: concept\nid: n/); // other frontmatter untouched
    expect(after).toContain('# N\n\nbody');         // body untouched
  });

  it('blocks Markdown/ targets, missing targets, and inserts status when absent', () => {
    const dir = vault();
    expect(setStatus(dir, 'Markdown/src.md', 'documented', loadConfig(dir, []), { dryRun: false }).skipped?.reason).toBe('source-immutable');
    expect(setStatus(dir, '01-Concepts/missing.md', 'documented', loadConfig(dir, []), { dryRun: false }).skipped?.reason).toBe('not-found');
    writeFileSync(join(dir, '01-Concepts', 'bare.md'), '---\ntype: concept\n---\n# Bare');
    setStatus(dir, '01-Concepts/bare.md', 'documented', loadConfig(dir, []), { dryRun: false, runId: 'RUN2' });
    expect(readFileSync(join(dir, '01-Concepts', 'bare.md'), 'utf8')).toContain('status: "documented"');
  });
});
