import { describe, it, expect } from 'vitest';
import { isEntrypoint } from '../src/cli.js';
import { mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'cortex-entry-'));
}

describe('isEntrypoint', () => {
  it('is true when argv[1] is the module file itself', () => {
    const dir = tmp();
    const real = join(dir, 'cli.js');
    writeFileSync(real, '// cli');
    expect(isEntrypoint(real, pathToFileURL(real).href)).toBe(true);
  });

  it('is true when argv[1] is a SYMLINK to the module file (the npm/npx bin case)', () => {
    const dir = tmp();
    const real = join(dir, 'cli.js');
    writeFileSync(real, '// cli');
    const link = join(dir, 'cortex-link');
    symlinkSync(real, link);
    // The published `cortex` bin is a symlink; argv[1] is the link path,
    // import.meta.url is the real file. A bare `===` comparison fails here.
    expect(isEntrypoint(link, pathToFileURL(real).href)).toBe(true);
  });

  it('is false for an unrelated file', () => {
    const dir = tmp();
    const real = join(dir, 'cli.js');
    const other = join(dir, 'other.js');
    writeFileSync(real, '// cli');
    writeFileSync(other, '// other');
    expect(isEntrypoint(other, pathToFileURL(real).href)).toBe(false);
  });

  it('is false when argv[1] is undefined (imported as a module)', () => {
    const dir = tmp();
    const real = join(dir, 'cli.js');
    writeFileSync(real, '// cli');
    expect(isEntrypoint(undefined, pathToFileURL(real).href)).toBe(false);
  });
});
