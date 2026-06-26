import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('phase 5 config defaults', () => {
  it('provides mocDir/dupeThreshold/outDir defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cfg5-'));
    const c = loadConfig(dir, []);
    expect(c.mocDir).toBe('00-MOC');
    expect(c.dupeThreshold).toBe(0.45);
    expect(c.outDir).toBe('.cortex/out');
  });
  it('honors overrides from .cortex.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cfg5-'));
    writeFileSync(join(dir, '.cortex.json'), JSON.stringify({ mocDir: 'MOC', dupeThreshold: 0.6 }));
    const c = loadConfig(dir, []);
    expect(c.mocDir).toBe('MOC');
    expect(c.dupeThreshold).toBe(0.6);
    expect(c.outDir).toBe('.cortex/out');
  });
});
