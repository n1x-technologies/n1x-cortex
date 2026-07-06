// toolkit/src/capture/guard.ts
//
// Pure decision logic for Phase 7 autonomous background capture.
// No I/O, no spawning — everything that decides *whether* to capture lives here
// so it is trivially testable. The impure spawn lives in runner.ts/dispatch.ts.
import type { CortexConfig } from '../types.js';
import type { HookState } from '../hooks/state.js';

/** True inside a background capture session — set by spawnCapture to stop recursion. */
export function isChild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CORTEX_AUTONOMY_CHILD === '1';
}

export type CaptureMode = 'auto-draft' | 'full';
export interface CaptureDecision {
  ok: boolean;
  reason?: string;          // why we declined (for the log / tests)
  mode?: CaptureMode;
}

/**
 * Decide whether `Stop` should spawn a background capture. Pure: `now` injected.
 * Order matters — the first failing guard wins so `reason` is specific.
 */
export function shouldCapture(state: HookState, config: CortexConfig, now: number): CaptureDecision {
  if (config.autonomy !== 'auto-draft' && config.autonomy !== 'full') {
    return { ok: false, reason: `autonomy=${config.autonomy}` };
  }
  if (isChild()) return { ok: false, reason: 'child-session' };
  if (state.paused) return { ok: false, reason: 'paused' };
  if (state.session.captureCount >= config.maxCapturesPerSession) {
    return { ok: false, reason: 'session-cap' };
  }
  if (now - state.lastCaptureAt < config.captureCooldownMs) {
    return { ok: false, reason: 'cooldown' };
  }
  return { ok: true, mode: config.autonomy };
}

/** A lock is stale (its owning run is presumed dead) once older than captureMaxRunMs. */
export function lockIsStale(lockMtime: number, now: number, maxRunMs: number): boolean {
  return now - lockMtime >= maxRunMs;
}
