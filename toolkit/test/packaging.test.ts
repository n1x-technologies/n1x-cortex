import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));   // toolkit/test/
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

describe('package is publishable', () => {
  it('has the scoped name and the cortex bin', () => {
    expect(pkg.name).toBe('@n1x-technologies/cortex');
    expect(pkg.bin.cortex).toBe('./dist/cli.js');
  });
  it('is configured for a public scoped publish', () => {
    expect(pkg.publishConfig?.access).toBe('public');
    expect(pkg.license).toBe('MIT');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.engines?.node).toBe('>=18');
  });
  it('ships only the build output', () => {
    expect(pkg.files).toContain('dist/');
  });
  it('keeps the heavy ML dep as an optional peer, not a hard dependency', () => {
    expect(pkg.dependencies?.['@xenova/transformers']).toBeUndefined();
    expect(pkg.peerDependencies?.['@xenova/transformers']).toBe('^2.17.2');
    expect(pkg.peerDependenciesMeta?.['@xenova/transformers']?.optional).toBe(true);
    // exact version guard — must match peerDependencies
    expect(pkg.devDependencies?.['@xenova/transformers']).toBe('^2.17.2');
  });
  it('has an executable shebang as the first line of cli.ts', () => {
    const cli = readFileSync(join(here, '..', 'src', 'cli.ts'), 'utf8');
    expect(cli.startsWith('#!/usr/bin/env node\n')).toBe(true);
  });
  it('ships an MIT LICENSE file at the repo root with correct copyright', () => {
    const license = join(here, '..', '..', 'LICENSE');
    expect(existsSync(license)).toBe(true);
    const text = readFileSync(license, 'utf8');
    expect(text).toMatch(/MIT License/);
    expect(text).toContain('Copyright (c) 2026 N1X Technologies');
  });
  it('published tarball contains README.md, LICENSE, and dist/', async () => {
    const toolkitDir = join(here, '..');
    const raw = execSync('npm pack --dry-run --json', { cwd: toolkitDir, encoding: 'utf8' });
    // Lifecycle scripts (prepack → build) may print to stdout before the JSON array.
    // Slice from the first '[' to extract just the JSON portion.
    const jsonStr = raw.slice(raw.indexOf('['));
    const files = JSON.parse(jsonStr)[0].files.map((f: { path: string }) => f.path);
    expect(files).toContain('README.md');
    expect(files).toContain('LICENSE');
    expect(files.some((p: string) => p.startsWith('dist/'))).toBe(true);
  }, 60000);
});
