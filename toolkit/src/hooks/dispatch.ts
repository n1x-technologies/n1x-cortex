// toolkit/src/hooks/dispatch.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { loadState, saveState, type HookState } from './state.js';
import { onSessionStart, onStop, onPostToolUse, onUserPromptSubmit, onSessionEnd, type Handler } from './handlers.js';
import { isChild } from '../capture/guard.js';
import { spawnCapture, type SpawnDeps } from '../capture/runner.js';

const HANDLERS: Record<string, Handler> = {
  SessionStart: onSessionStart,
  Stop: onStop,
  PostToolUse: onPostToolUse,
  UserPromptSubmit: onUserPromptSubmit,
  SessionEnd: onSessionEnd,
};

export function runHook(vaultDir: string, event: string, stdinJson: string, spawnDeps: SpawnDeps = {}): string {
  try {
    const handler = HANDLERS[event];
    if (!handler) return '{}';
    const trimmed = stdinJson.trim();
    let payload: Record<string, unknown> = {};
    if (trimmed) {
      try { payload = JSON.parse(trimmed); } catch { return '{}'; }
    }
    const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
    const state = loadState(vaultDir);
    const { state: next, response, capture } = handler(payload, vaultDir, config, state);

    // Phase 7 — the only impure side effect: spawn the background capture the
    // handler *requested*. Self-contained try/catch so a spawn failure never
    // strips the handler's response (fail-open). Never spawns inside a child run.
    let finalState: HookState = next;
    if (capture && !isChild()) {
      try {
        const spawned = spawnCapture(vaultDir, capture.sources, capture.mode, config, spawnDeps);
        if (spawned.spawned) {
          finalState = {
            ...next,
            lastCaptureAt: Date.now(),
            session: { ...next.session, captureCount: next.session.captureCount + 1 },
          };
        }
      } catch { /* fail-open: keep the handler's state + response */ }
    }

    saveState(vaultDir, finalState);
    return JSON.stringify(response ?? {});
  } catch {
    return '{}';
  }
}
