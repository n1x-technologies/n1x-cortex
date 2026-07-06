import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isChild, shouldCapture, lockIsStale } from '../src/capture/guard.js';
import { freshState } from '../src/hooks/state.js';
import { loadConfig } from '../src/config.js';
import type { CortexConfig } from '../src/types.js';

function cfg(over: Partial<CortexConfig> = {}): CortexConfig {
  const base = loadConfig(mkdtempSync(join(tmpdir(), 'cortex-cg-')), []);
  return { ...base, ...over };
}

afterEach(() => { delete process.env.CORTEX_AUTONOMY_CHILD; });

describe('isChild', () => {
  it('reads the anti-recursion env flag', () => {
    expect(isChild({})).toBe(false);
    expect(isChild({ CORTEX_AUTONOMY_CHILD: '1' })).toBe(true);
    expect(isChild({ CORTEX_AUTONOMY_CHILD: '0' })).toBe(false);
  });
});

describe('shouldCapture', () => {
  const NOW = 1_000_000_000;

  it('approves auto-draft on a fresh state and reports the mode', () => {
    const d = shouldCapture(freshState(), cfg({ autonomy: 'auto-draft' }), NOW);
    expect(d).toEqual({ ok: true, mode: 'auto-draft' });
  });
  it('approves full and reports mode full', () => {
    const d = shouldCapture(freshState(), cfg({ autonomy: 'full' }), NOW);
    expect(d.ok).toBe(true);
    expect(d.mode).toBe('full');
  });
  it('declines for suggest and off (no auto-write)', () => {
    expect(shouldCapture(freshState(), cfg({ autonomy: 'suggest' }), NOW).ok).toBe(false);
    expect(shouldCapture(freshState(), cfg({ autonomy: 'off' }), NOW).ok).toBe(false);
  });
  it('declines inside a child session (anti-recursion)', () => {
    process.env.CORTEX_AUTONOMY_CHILD = '1';
    expect(shouldCapture(freshState(), cfg({ autonomy: 'full' }), NOW)).toMatchObject({ ok: false, reason: 'child-session' });
  });
  it('declines when paused', () => {
    const s = { ...freshState(), paused: true };
    expect(shouldCapture(s, cfg({ autonomy: 'full' }), NOW)).toMatchObject({ ok: false, reason: 'paused' });
  });
  it('declines when the per-session cap is reached', () => {
    const s = { ...freshState(), session: { injectedTokens: 0, captureCount: 20 } };
    expect(shouldCapture(s, cfg({ autonomy: 'full', maxCapturesPerSession: 20 }), NOW)).toMatchObject({ ok: false, reason: 'session-cap' });
  });
  it('declines within the cooldown window', () => {
    const s = { ...freshState(), lastCaptureAt: NOW - 1000 };
    expect(shouldCapture(s, cfg({ autonomy: 'full', captureCooldownMs: 60000 }), NOW)).toMatchObject({ ok: false, reason: 'cooldown' });
  });
  it('approves once the cooldown has elapsed', () => {
    const s = { ...freshState(), lastCaptureAt: NOW - 60001 };
    expect(shouldCapture(s, cfg({ autonomy: 'full', captureCooldownMs: 60000 }), NOW).ok).toBe(true);
  });
});

describe('lockIsStale', () => {
  it('is stale only once older than the max run age', () => {
    expect(lockIsStale(1000, 1000 + 900000, 900000)).toBe(true);
    expect(lockIsStale(1000, 1000 + 899999, 900000)).toBe(false);
  });
});
