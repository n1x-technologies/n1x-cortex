import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'); // repo root
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('release workflow', () => {
  const yml = read('.github/workflows/release.yml');
  it('triggers on version tags', () => {
    expect(yml).toMatch(/tags:\s*\[\s*'v\*'\s*\]/);
  });
  it('publishes with the NPM_TOKEN secret and public access', () => {
    expect(yml).toContain('npm publish --access public');
    expect(yml).toContain('secrets.NPM_TOKEN');
  });
  it('runs from the toolkit working directory', () => {
    expect(yml).toContain('working-directory: toolkit');
  });
});

describe('ci workflow', () => {
  const yml = read('.github/workflows/ci.yml');
  it('runs tests on push and pull_request', () => {
    expect(yml).toContain('pull_request');
    expect(yml).toContain('npm test');
  });
});
