import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('phase 6 semantic config defaults', () => {
  it('provides embedModel/embedDir/semanticDupeThreshold/rrfK defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cfg6-'));
    const c = loadConfig(dir, []);
    expect(c.embedModel).toBe('Xenova/multilingual-e5-small');
    expect(c.embedDir).toBe('.cortex/embeddings');
    expect(c.semanticDupeThreshold).toBe(0.88);
    expect(c.rrfK).toBe(60);
  });
  it('honors overrides from .cortex.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cfg6-'));
    writeFileSync(join(dir, '.cortex.json'), JSON.stringify({ embedModel: 'Xenova/bge-small-en', rrfK: 30 }));
    const c = loadConfig(dir, []);
    expect(c.embedModel).toBe('Xenova/bge-small-en');
    expect(c.rrfK).toBe(30);
    expect(c.embedDir).toBe('.cortex/embeddings');
  });
});
