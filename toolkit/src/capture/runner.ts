// toolkit/src/capture/runner.ts
//
// The single new *impure* capability of Phase 7: launch the existing /atomize
// skill in a detached, headless Claude process. No atomization logic lives here
// — only the command construction (pure, testable) and a guarded, fail-open spawn.
import { spawn as nodeSpawn } from 'node:child_process';
import { openSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CortexConfig } from '../types.js';
import type { CaptureMode } from './guard.js';
import { lockIsStale } from './guard.js';

/**
 * Headless run permission posture. A background autonomy run must be able to call
 * the cortex CLI (Bash) and write notes without an interactive prompt, so it runs
 * with permissions bypassed — scoped by the skill to `_inbox/` + curated folders,
 * and every write is backed up + reversible (`cortex undo`). Tunable here if a
 * Claude Code version names this differently.
 */
const PERMISSION_ARGS = ['--permission-mode', 'bypassPermissions'];

/** Mode-specific tail of the capture prompt: where the skill must stop. */
function modeInstruction(mode: CaptureMode): string {
  return mode === 'full'
    ? 'For each note you are confident is complete and correct, advance its status and promote it into its curated folder; leave anything uncertain as a draft in _inbox/.'
    : 'Write the distilled notes as drafts in _inbox/ only. Do NOT set-status or promote — leave everything as draft for human review.';
}

/** Pure: the headless `/atomize` invocation for a set of changed sources. */
export function buildCaptureCommand(
  sources: string[],
  mode: CaptureMode,
  config: CortexConfig,
): { bin: string; args: string[] } {
  const list = sources.map(s => `- ${s}`).join('\n');
  const prompt = [
    'Run the /atomize skill to capture changed source documents into the Cortex knowledge graph.',
    'These source files under the vault changed and need atomizing:',
    list,
    modeInstruction(mode),
    'Every write is backed up and reversible with `cortex undo`. Be concise; this is an unattended background run.',
  ].join('\n\n');
  return { bin: config.claudeBin, args: ['-p', prompt, ...PERMISSION_ARGS] };
}

export interface Lock { pid: number; mtime: number; }
export interface SpawnDeps {
  spawn?: typeof nodeSpawn;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
}
export interface SpawnResult { spawned: boolean; reason?: string; }

function captureDir(vaultDir: string): string {
  return join(vaultDir, '.cortex');
}
function lockPath(vaultDir: string): string {
  return join(captureDir(vaultDir), 'capture.lock');
}
function logPath(vaultDir: string): string {
  return join(captureDir(vaultDir), 'capture.log');
}

export function readLock(vaultDir: string): Lock | null {
  const p = lockPath(vaultDir);
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return { pid: Number(raw.pid) || 0, mtime: statSync(p).mtimeMs };
  } catch {
    return null;
  }
}

export function releaseLock(vaultDir: string): void {
  try { rmSync(lockPath(vaultDir), { force: true }); } catch { /* fail-open */ }
}

function appendLog(vaultDir: string, line: string, now: number): void {
  try {
    const dir = captureDir(vaultDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(logPath(vaultDir), `[${now}] ${line}\n`, { flag: 'a' });
  } catch { /* fail-open */ }
}

/**
 * Spawn a detached, headless capture run. Fail-open: any error returns
 * `{ spawned: false, reason }` and never throws into the caller's hook response.
 * The injected `deps.spawn` lets tests assert the command + env without launching Claude.
 */
export function spawnCapture(
  vaultDir: string,
  sources: string[],
  mode: CaptureMode,
  config: CortexConfig,
  deps: SpawnDeps = {},
): SpawnResult {
  const spawn = deps.spawn ?? nodeSpawn;
  const now = (deps.now ?? Date.now)();
  const env = deps.env ?? process.env;
  try {
    if (sources.length === 0) return { spawned: false, reason: 'no-sources' };

    // Single-flight: a fresh lock means a run is already going.
    const existing = readLock(vaultDir);
    if (existing && !lockIsStale(existing.mtime, now, config.captureMaxRunMs)) {
      return { spawned: false, reason: 'locked' };
    }

    const dir = captureDir(vaultDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const { bin, args } = buildCaptureCommand(sources, mode, config);
    const out = openSync(logPath(vaultDir), 'a');
    const child = spawn(bin, args, {
      cwd: vaultDir,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...env, CORTEX_AUTONOMY_CHILD: '1' },
    });
    writeFileSync(lockPath(vaultDir), JSON.stringify({ pid: child.pid ?? 0, mode }), 'utf8');
    appendLog(vaultDir, `spawn ${mode} pid=${child.pid ?? 0} sources=${sources.length}`, now);
    child.unref();
    return { spawned: true };
  } catch (e) {
    appendLog(vaultDir, `spawn failed: ${(e as Error).message}`, now);
    return { spawned: false, reason: (e as Error).message };
  }
}
