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

  it('treats a whole-tree exclusion as covered, however it is spelled', () => {
    for (const rule of [
      '.cortex', '.cortex/', '.cortex/*', '.cortex/**',
      '/.cortex/', '**/.cortex/', '**/.cortex/*', '/**/.cortex',
    ]) {
      const dir = tmp();
      writeFileSync(join(dir, '.gitignore'), `${rule}\n`);
      expect(ensureCortexIgnored(dir), rule).toBe(false);
    }
  });

  // Coverage is decided over the FILE. Deciding per line meant one negation
  // anywhere granted blanket coverage, so `.cortex/models/` plus
  // `!.cortex/models/m.json` left the embeddings store and backups ignored by
  // nothing — the partial-rule hole switched back on by adding a single `!`.
  it('appends when a negation accompanies a merely partial exclusion', () => {
    for (const before of [
      '.cortex/models/\n!.cortex/models/m.json\n',
      '.cortex/backups/\n!.cortex/backups/keep.md\n',
    ]) {
      const dir = tmp();
      writeFileSync(join(dir, '.gitignore'), before);
      expect(ensureCortexIgnored(dir), before).toBe(true);
      expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.cortex/*');
    }
  });

  // With a negation present the appended rule is the CONTENTS form, so the
  // author's `!` keeps working. `.cortex/` would exclude the directory itself
  // and git cannot re-include a path inside an excluded directory.
  // git resolves by LAST match, so the base exclusion has to precede the
  // negation. Appended after it, `.cortex/*` wins and the negation is just as
  // dead as it would have been under a blanket `.cortex/`.
  it('inserts the contents form BEFORE an existing negation so it survives', () => {
    const dir = tmp();
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n!.cortex/embeddings/\n');
    expect(ensureCortexIgnored(dir)).toBe(true);
    const after = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(after).not.toMatch(/^\.cortex\/$/m);
    expect(after.indexOf('.cortex/*')).toBeLessThan(after.indexOf('!.cortex/embeddings/'));
    expect(after).toContain('node_modules/');   // unrelated rules kept
  });

  it('does not read a leading-whitespace rule as coverage', () => {
    // git strips trailing whitespace but not leading, so `  .cortex/` is a
    // pattern with literal spaces and matches nothing.
    const dir = tmp();
    writeFileSync(join(dir, '.gitignore'), '  .cortex/\n');
    expect(ensureCortexIgnored(dir)).toBe(true);
  });

  it('tolerates trailing whitespace and CRLF on a real rule', () => {
    for (const rule of ['.cortex/   \n', '.cortex/\r\n']) {
      const dir = tmp();
      writeFileSync(join(dir, '.gitignore'), rule);
      expect(ensureCortexIgnored(dir), JSON.stringify(rule)).toBe(false);
    }
  });

  // The opposite failure from the one the scoped-ignore fix addressed: a rule
  // about ONE subdirectory says nothing about the rest, and treating it as
  // coverage leaves the several-MB model and the embedding store committable.
  // The callers print nothing when this returns false, so the user gets no
  // warning at all.
  it('still adds the block when only a .cortex subdirectory is ignored', () => {
    for (const rule of ['.cortex/backups/', '.cortex/models/', '.cortex/out']) {
      const dir = tmp();
      writeFileSync(join(dir, '.gitignore'), `${rule}\n`);
      expect(ensureCortexIgnored(dir), rule).toBe(true);
      expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('\n.cortex/');
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
