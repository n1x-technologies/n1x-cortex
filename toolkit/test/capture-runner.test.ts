import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCaptureCommand, spawnCapture, readLock } from '../src/capture/runner.js';
import { loadConfig } from '../src/config.js';
import type { CortexConfig } from '../src/types.js';

function vault(over: Partial<CortexConfig> = {}): { dir: string; config: CortexConfig } {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-cr-'));
  mkdirSync(join(dir, '.cortex'), { recursive: true });
  return { dir, config: { ...loadConfig(dir, []), ...over } };
}

interface Call { bin: string; args: string[]; opts: any; }
function stubSpawn(calls: Call[], pid = 4242) {
  return ((bin: string, args: string[], opts: any) => {
    calls.push({ bin, args, opts });
    return { pid, unref() {} } as any;
  }) as any;
}

describe('buildCaptureCommand', () => {
  it('emits a headless /atomize invocation naming the sources', () => {
    const { config } = vault();
    const { bin, args } = buildCaptureCommand(['Markdown/a.md', 'Markdown/b.md'], 'auto-draft', config);
    expect(bin).toBe(config.claudeBin);
    expect(args[0]).toBe('-p');
    expect(args[1]).toContain('/atomize');
    expect(args[1]).toContain('Markdown/a.md');
    expect(args[1]).toContain('Markdown/b.md');
  });
  it('auto-draft instructs to stop at the draft barrier', () => {
    const { config } = vault();
    const { args } = buildCaptureCommand(['Markdown/a.md'], 'auto-draft', config);
    expect(args[1]).toMatch(/do not set-status or promote/i);
  });
  it('full instructs to promote confident notes', () => {
    const { config } = vault();
    const { args } = buildCaptureCommand(['Markdown/a.md'], 'full', config);
    expect(args[1]).toMatch(/promote/i);
  });
});

describe('spawnCapture', () => {
  it('spawns detached with the anti-recursion env, writes a lock and logs', () => {
    const { dir, config } = vault();
    const calls: Call[] = [];
    const r = spawnCapture(dir, ['Markdown/a.md'], 'full', config, { spawn: stubSpawn(calls), env: {} });
    expect(r.spawned).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.detached).toBe(true);
    expect(calls[0].opts.cwd).toBe(dir);
    expect(calls[0].opts.env.CORTEX_AUTONOMY_CHILD).toBe('1');
    expect(readLock(dir)?.pid).toBe(4242);
    expect(existsSync(join(dir, '.cortex', 'capture.log'))).toBe(true);
  });

  it('does nothing with no sources', () => {
    const { dir, config } = vault();
    const calls: Call[] = [];
    const r = spawnCapture(dir, [], 'full', config, { spawn: stubSpawn(calls) });
    expect(r).toMatchObject({ spawned: false, reason: 'no-sources' });
    expect(calls).toHaveLength(0);
  });

  it('skips when a fresh lock is held (single-flight)', () => {
    const { dir, config } = vault();
    writeFileSync(join(dir, '.cortex', 'capture.lock'), JSON.stringify({ pid: 1 }), 'utf8');
    const calls: Call[] = [];
    const r = spawnCapture(dir, ['Markdown/a.md'], 'full', config, { spawn: stubSpawn(calls) });
    expect(r).toMatchObject({ spawned: false, reason: 'locked' });
    expect(calls).toHaveLength(0);
  });

  it('reclaims a stale lock and spawns', () => {
    const { dir, config } = vault({ captureMaxRunMs: 0 });   // any existing lock is immediately stale
    writeFileSync(join(dir, '.cortex', 'capture.lock'), JSON.stringify({ pid: 1 }), 'utf8');
    const mtime = statSync(join(dir, '.cortex', 'capture.lock')).mtimeMs;
    const calls: Call[] = [];
    const r = spawnCapture(dir, ['Markdown/a.md'], 'full', config, { spawn: stubSpawn(calls), now: () => mtime + 1 });
    expect(r.spawned).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('is fail-open when the spawner throws (e.g. claude not found)', () => {
    const { dir, config } = vault();
    const throwing = (() => { throw new Error('ENOENT'); }) as any;
    const r = spawnCapture(dir, ['Markdown/a.md'], 'full', config, { spawn: throwing, env: {} });
    expect(r.spawned).toBe(false);
    expect(r.reason).toMatch(/ENOENT/);
    expect(readFileSync(join(dir, '.cortex', 'capture.log'), 'utf8')).toMatch(/spawn failed/);
  });
});
