import { describe, it, expect } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { runStatus } from '../src/commands/status.js';
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

describe('runStatus', () => {
  it('counts notes by type and status and reports orphans', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-st-'));
    mkdirSync(join(dir, '03-Reglamentos'));
    writeFileSync(join(dir, '03-Reglamentos', 'r1.md'), '---\ntipo: regla\nestado: documentado\n---\n# R1\n[[Ghost]]');
    writeFileSync(join(dir, '03-Reglamentos', 'r2.md'), '---\ntipo: regla\nestado: borrador\n---\n# R2');
    const s = runStatus(dir);
    expect(s.total).toBe(2);
    expect(s.byType.regla).toBe(2);
    expect(s.byStatus.documentado).toBe(1);
    expect(s.byStatus.borrador).toBe(1);
    expect(s.orphans).toBe(1);
  });
});
