import { describe, it, expect } from 'vitest';
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
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.engines?.node).toBe('>=18');
  });
  it('ships only the build output', () => {
    expect(pkg.files).toContain('dist/');
  });
  it('keeps the heavy ML dep as an optional peer, not a hard dependency', () => {
    expect(pkg.dependencies?.['@xenova/transformers']).toBeUndefined();
    expect(pkg.peerDependencies?.['@xenova/transformers']).toBe('^2.17.2');
    expect(pkg.peerDependenciesMeta?.['@xenova/transformers']?.optional).toBe(true);
    expect(pkg.devDependencies?.['@xenova/transformers']).toBeDefined();
  });
  it('has an executable shebang as the first line of cli.ts', () => {
    const cli = readFileSync(join(here, '..', 'src', 'cli.ts'), 'utf8');
    expect(cli.startsWith('#!/usr/bin/env node\n')).toBe(true);
  });
  it('ships an MIT LICENSE file at the repo root', () => {
    const license = join(here, '..', '..', 'LICENSE');
    expect(existsSync(license)).toBe(true);
    expect(readFileSync(license, 'utf8')).toMatch(/MIT License/);
  });
});
