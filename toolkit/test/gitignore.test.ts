// toolkit/test/gitignore.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureCortexIgnored } from '../src/gitignore.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'cortex-gitignore-'));
}

describe('ensureCortexIgnored', () => {
  it('creates .gitignore with the .cortex/ block when none exists', () => {
    const dir = tmp();
    const changed = ensureCortexIgnored(dir);
    expect(changed).toBe(true);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gi).toContain('.cortex/');
    expect(gi).toContain('# Cortex');
  });

  it('appends to an existing .gitignore without clobbering other rules', () => {
    const dir = tmp();
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n*.log\n');
    const changed = ensureCortexIgnored(dir);
    expect(changed).toBe(true);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gi).toContain('node_modules/');
    expect(gi).toContain('*.log');
    expect(gi).toContain('.cortex/');
  });

  it('is idempotent — a second run makes no change', () => {
    const dir = tmp();
    ensureCortexIgnored(dir);
    const before = readFileSync(join(dir, '.gitignore'), 'utf8');
    const changed = ensureCortexIgnored(dir);
    expect(changed).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(before);
  });

  it('treats an existing bare `.cortex` entry as already covered', () => {
    const dir = tmp();
    writeFileSync(join(dir, '.gitignore'), '.cortex\n');
    expect(ensureCortexIgnored(dir)).toBe(false);
  });

  // The bug this guards: appending a blanket `.cortex/` under a deliberately
  // scoped ignore voids the negation, because git cannot re-include a path
  // inside an excluded directory. Files already tracked stay tracked, so
  // nothing looks wrong until the store gains a second file — at which point
  // it is silent data loss. bench/fixtures/ci-vault is exactly this shape, and
  // `cortex embed` re-broke it on every regeneration.
  it('leaves a deliberately scoped .cortex ignore alone', () => {
    const dir = tmp();
    const scoped = '.cortex/*\n!.cortex/embeddings/\n';
    writeFileSync(join(dir, '.gitignore'), scoped);
    expect(ensureCortexIgnored(dir)).toBe(false);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(scoped);
  });

  it('treats any rule mentioning .cortex as intent, including a negation alone', () => {
    for (const rule of ['.cortex/*', '/.cortex/', '!.cortex/embeddings/', '.cortex/backups/']) {
      const dir = tmp();
      writeFileSync(join(dir, '.gitignore'), `${rule}\n`);
      expect(ensureCortexIgnored(dir), rule).toBe(false);
    }
  });

  it('does not mistake a commented-out rule for coverage', () => {
    const dir = tmp();
    writeFileSync(join(dir, '.gitignore'), '# .cortex/\n');
    expect(ensureCortexIgnored(dir)).toBe(true);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('\n.cortex/');
  });

  it('does not treat an unrelated dotfile rule as .cortex coverage', () => {
    const dir = tmp();
    writeFileSync(join(dir, '.gitignore'), '.cortexfoo/\n.cortex.json\n');
    expect(ensureCortexIgnored(dir)).toBe(true);
  });

  it('does not ignore .cortex.json (config stays committable)', () => {
    const dir = tmp();
    ensureCortexIgnored(dir);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gi).not.toContain('.cortex.json');
  });

  it('appends a separating newline when the file lacks a trailing newline', () => {
    const dir = tmp();
    writeFileSync(join(dir, '.gitignore'), 'foo');
    ensureCortexIgnored(dir);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gi.startsWith('foo\n')).toBe(true);
    expect(gi).toContain('.cortex/');
  });
});
