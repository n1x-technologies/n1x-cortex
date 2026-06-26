// toolkit/test/hook-handlers.test.ts
import { describe, it, expect } from 'vitest';
import { onSessionStart, onStop } from '../src/hooks/handlers.js';
import { freshState } from '../src/hooks/state.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-hh-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'a.md'), '# Source A');
  mkdirSync(join(dir, '01-Notes'));
  writeFileSync(join(dir, '01-Notes', 'n.md'), '---\nstatus: "draft"\n---\n# A note');
  return dir;
}

describe('onSessionStart', () => {
  it('injects a one-line status and snapshots sources', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const { state, response } = onSessionStart({}, dir, cfg, freshState());
    expect(state.sources['Markdown/a.md']).toBeGreaterThan(0);
    expect(response.hookSpecificOutput?.additionalContext).toMatch(/Cortex: 1 notes/);
  });
  it('is a silent no-op when paused', () => {
    const dir = vault();
    const r = onSessionStart({}, dir, loadConfig(dir, []), { ...freshState(), paused: true });
    expect(r.response).toEqual({});
  });
});

describe('onStop', () => {
  it('suggests /atomize when a source changed, and writes no notes', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const before = readdirSync(join(dir, '01-Notes')).length;
    // snapshot is empty in freshState → the existing source counts as dirty
    const { state, response } = onStop({}, dir, cfg, freshState());
    expect(response.systemMessage).toMatch(/run \/atomize/);
    expect(state.dirty).toEqual([]);                                  // cleared after announcing
    expect(readdirSync(join(dir, '01-Notes')).length).toBe(before);   // no note written
  });
  it('is silent when nothing changed', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const seeded = onStop({}, dir, cfg, freshState()).state;          // announce + clear
    const { response } = onStop({}, dir, cfg, seeded);                // snapshot now current
    expect(response).toEqual({});
  });
});
