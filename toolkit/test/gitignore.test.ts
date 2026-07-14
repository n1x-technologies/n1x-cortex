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
