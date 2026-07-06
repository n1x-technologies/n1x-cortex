import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onStop } from '../src/hooks/handlers.js';
import { runHook } from '../src/hooks/dispatch.js';
import { freshState } from '../src/hooks/state.js';
import { loadConfig } from '../src/config.js';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-hc-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'a.md'), '# Source A');
  mkdirSync(join(dir, '01-Notes'));
  writeFileSync(join(dir, '01-Notes', 'n.md'), '---\nstatus: "draft"\n---\n# A note');
  return dir;
}

interface Call { bin: string; args: string[]; opts: any; }
function stubSpawn(calls: Call[]) {
  return ((bin: string, args: string[], opts: any) => {
    calls.push({ bin, args, opts });
    return { pid: 999, unref() {} } as any;
  }) as any;
}

afterEach(() => { delete process.env.CORTEX_AUTONOMY_CHILD; });

describe('onStop autonomous capture (Phase 7)', () => {
  it('auto-draft requests a background capture and writes no notes', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);   // default autonomy = auto-draft
    const before = readdirSync(join(dir, '01-Notes')).length;
    const r = onStop({}, dir, cfg, freshState());
    expect(r.capture).toMatchObject({ mode: 'auto-draft', sources: ['Markdown/a.md'] });
    expect(r.response.systemMessage).toMatch(/capturing 1 source/i);
    expect(r.state.dirty).toEqual([]);
    expect(readdirSync(join(dir, '01-Notes')).length).toBe(before);   // never writes
  });

  it('full requests a capture in mode full', () => {
    const dir = vault();
    const cfg = { ...loadConfig(dir, []), autonomy: 'full' as const };
    expect(onStop({}, dir, cfg, freshState()).capture?.mode).toBe('full');
  });

  it('suggest keeps the Phase 4 suggestion and requests no capture', () => {
    const dir = vault();
    const cfg = { ...loadConfig(dir, []), autonomy: 'suggest' as const };
    const r = onStop({}, dir, cfg, freshState());
    expect(r.capture).toBeUndefined();
    expect(r.response.systemMessage).toMatch(/run \/atomize/);
  });

  it('does not request a capture inside a child run, and keeps sources dirty for retry', () => {
    process.env.CORTEX_AUTONOMY_CHILD = '1';
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const r = onStop({}, dir, cfg, freshState());
    expect(r.capture).toBeUndefined();
    expect(r.state.dirty).toEqual(['Markdown/a.md']);   // preserved, not lost
  });
});

describe('dispatch spawns the requested capture (Phase 7)', () => {
  it('spawns once on Stop and records the capture in state', () => {
    const dir = vault();
    const calls: Call[] = [];
    const out = runHook(dir, 'Stop', '{}', { spawn: stubSpawn(calls), env: {} });
    expect(JSON.parse(out).systemMessage).toMatch(/capturing/i);
    expect(calls).toHaveLength(1);
    const state = JSON.parse(readFileSync(join(dir, '.cortex', 'state.json'), 'utf8'));
    expect(state.session.captureCount).toBe(1);
    expect(state.lastCaptureAt).toBeGreaterThan(0);
    expect(existsSync(join(dir, '.cortex', 'capture.lock'))).toBe(true);
  });

  it('does not spawn inside a child run', () => {
    process.env.CORTEX_AUTONOMY_CHILD = '1';
    const dir = vault();
    const calls: Call[] = [];
    runHook(dir, 'Stop', '{}', { spawn: stubSpawn(calls) });
    expect(calls).toHaveLength(0);
  });

  it('is fail-open: a throwing spawner still returns a valid response', () => {
    const dir = vault();
    const throwing = (() => { throw new Error('boom'); }) as any;
    const out = runHook(dir, 'Stop', '{}', { spawn: throwing, env: {} });
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out).systemMessage).toMatch(/capturing/i);
    const state = JSON.parse(readFileSync(join(dir, '.cortex', 'state.json'), 'utf8'));
    expect(state.session.captureCount).toBe(0);   // not counted when spawn failed
  });
});
