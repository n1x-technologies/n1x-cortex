import { describe, it, expect } from 'vitest';
import { inferFields, loadConfig } from '../src/config.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('inferFields', () => {
  it('detects Spanish field names', () => {
    expect(inferFields(['tipo', 'estado', 'id', 'fuente', 'modulo']))
      .toEqual({ type: 'tipo', status: 'estado', id: 'id', source: 'fuente' });
  });
  it('detects English field names', () => {
    expect(inferFields(['type', 'status', 'id', 'source']))
      .toEqual({ type: 'type', status: 'status', id: 'id', source: 'source' });
  });
  it('falls back to English defaults when nothing matches', () => {
    expect(inferFields(['foo', 'bar']))
      .toEqual({ type: 'type', status: 'status', id: 'id', source: 'source' });
  });
});

describe('loadConfig', () => {
  it('uses defaults + inference when no .cortex.json exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-'));
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    expect(cfg.fields.type).toBe('tipo');
    expect(cfg.statusLifecycle).toEqual(['draft', 'documented', 'verified']);
    expect(cfg.autonomy).toBe('auto-draft');
    expect(cfg.viz.port).toBe(4317);
    expect(cfg.sourcesDir).toBe('Markdown');
  });
  it('lets .cortex.json override defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-'));
    writeFileSync(join(dir, '.cortex.json'), JSON.stringify({ lang: 'es', autonomy: 'off' }));
    const cfg = loadConfig(dir, ['type']);
    expect(cfg.lang).toBe('es');
    expect(cfg.autonomy).toBe('off');
    expect(cfg.fields.type).toBe('type'); // still inferred where not overridden
  });
  it('throws a contextual error on malformed .cortex.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-'));
    writeFileSync(join(dir, '.cortex.json'), '{ not valid json');
    expect(() => loadConfig(dir, ['type'])).toThrow(/Invalid \.cortex\.json/);
  });
});
