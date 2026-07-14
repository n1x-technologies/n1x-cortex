// toolkit/test/hook-state.test.ts
import { describe, it, expect } from 'vitest';
import { freshState, loadState, saveState, snapshotSources, computeDirty, reconcile, markDirty, clearDirty, setPaused } from '../src/hooks/state.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-hook-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'a.md'), '# A');
  writeFileSync(join(dir, 'Markdown', 'b.md'), '# B');
  return dir;
}

describe('snapshotSources', () => {
  it('maps only sourcesDir .md files to mtimes', () => {
    const dir = vault();
    writeFileSync(join(dir, 'top.md'), '# not a source');  // outside Markdown/
    const snap = snapshotSources(dir, loadConfig(dir, []));
    expect(Object.keys(snap).sort()).toEqual(['Markdown/a.md', 'Markdown/b.md']);
  });
});

describe('computeDirty', () => {
  it('flags new and increased-mtime paths only', () => {
    const prev = { 'Markdown/a.md': 100, 'Markdown/b.md': 100 };
    const live = { 'Markdown/a.md': 100, 'Markdown/b.md': 200, 'Markdown/c.md': 50 };
    expect(computeDirty(prev, live)).toEqual(['Markdown/b.md', 'Markdown/c.md']);
  });
});

describe('reconcile', () => {
  it('updates snapshot and accumulates dirty union', () => {
    const s = { ...freshState(), sources: { 'Markdown/a.md': 100 }, dirty: ['Markdown/x.md'] };
    const next = reconcile(s, { 'Markdown/a.md': 300 });
    expect(next.sources).toEqual({ 'Markdown/a.md': 300 });
    expect(next.dirty).toEqual(['Markdown/a.md', 'Markdown/x.md']);
  });
});

describe('load/save + mutators', () => {
  it('round-trips, tolerates missing/corrupt, and mutates immutably', () => {
    const dir = vault();
    expect(loadState(dir)).toEqual(freshState());           // missing → fresh
    saveState(dir, { ...freshState(), paused: true });
    expect(loadState(dir).paused).toBe(true);               // round-trip
    writeFileSync(join(dir, '.cortex', 'state.json'), 'not json');
    expect(loadState(dir)).toEqual(freshState());           // corrupt → fresh
    expect(markDirty(freshState(), 'Markdown/a.md').dirty).toEqual(['Markdown/a.md']);
    expect(clearDirty({ ...freshState(), dirty: ['x'] }).dirty).toEqual([]);
    expect(setPaused(freshState(), true).paused).toBe(true);
  });
});
