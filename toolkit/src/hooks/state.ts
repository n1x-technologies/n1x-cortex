// toolkit/src/hooks/state.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { CortexConfig } from '../types.js';

export interface HookState {
  version: 1;
  sources: Record<string, number>;   // vault-relative .md path → mtimeMs
  dirty: string[];                    // sources changed since last clear
  paused: boolean;
  session: { injectedTokens: number };
}

export function freshState(): HookState {
  return { version: 1, sources: {}, dirty: [], paused: false, session: { injectedTokens: 0 } };
}

function statePath(vaultDir: string): string {
  return join(vaultDir, '.cortex', 'state.json');
}

export function loadState(vaultDir: string): HookState {
  const p = statePath(vaultDir);
  if (!existsSync(p)) return freshState();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    if (!raw || raw.version !== 1) return freshState();
    return { ...freshState(), ...raw, session: { ...freshState().session, ...(raw.session ?? {}) } };
  } catch {
    return freshState();
  }
}

export function saveState(vaultDir: string, state: HookState): void {
  const dir = join(vaultDir, '.cortex');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(vaultDir), JSON.stringify(state, null, 2));
}

export function snapshotSources(vaultDir: string, config: CortexConfig): Record<string, number> {
  const root = join(vaultDir, config.sourcesDir);
  const out: Record<string, number> = {};
  if (!existsSync(root)) return out;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        out[relative(vaultDir, full).split(sep).join('/')] = statSync(full).mtimeMs;
      }
    }
  };
  walk(root);
  return out;
}

export function computeDirty(prev: Record<string, number>, live: Record<string, number>): string[] {
  const dirty: string[] = [];
  for (const [path, mtime] of Object.entries(live)) {
    if (prev[path] === undefined || prev[path] < mtime) dirty.push(path);
  }
  return dirty.sort();
}

export function reconcile(state: HookState, live: Record<string, number>): HookState {
  const newly = computeDirty(state.sources, live);
  const dirty = Array.from(new Set([...state.dirty, ...newly])).sort();
  return { ...state, sources: live, dirty };
}

export function markDirty(state: HookState, relPath: string): HookState {
  if (state.dirty.includes(relPath)) return state;
  return { ...state, dirty: [...state.dirty, relPath].sort() };
}

export function clearDirty(state: HookState): HookState {
  return { ...state, dirty: [] };
}

export function setPaused(state: HookState, paused: boolean): HookState {
  return { ...state, paused };
}
