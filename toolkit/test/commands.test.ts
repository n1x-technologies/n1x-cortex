import { describe, it, expect } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-cmd-'));
  mkdirSync(join(dir, '03-Reglamentos'));
  writeFileSync(join(dir, '03-Reglamentos', 'r.md'), '---\ntipo: regla\nestado: documentado\n---\n# R');
  return dir;
}

describe('runInit', () => {
  it('writes a .cortex.json with inferred fields', () => {
    const dir = vault();
    const { created, config } = runInit(dir);
    expect(created).toBe(true);
    expect(existsSync(join(dir, '.cortex.json'))).toBe(true);
    expect(config.fields.type).toBe('tipo');
    expect(config.fields.status).toBe('estado');
  });
  it('does not overwrite an existing config', () => {
    const dir = vault();
    runInit(dir);
    const { created } = runInit(dir);
    expect(created).toBe(false);
  });
});
