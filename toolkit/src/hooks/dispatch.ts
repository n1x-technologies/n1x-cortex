// toolkit/src/hooks/dispatch.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { loadState, saveState } from './state.js';
import { onSessionStart, onStop, onPostToolUse, type Handler } from './handlers.js';

const HANDLERS: Record<string, Handler> = {
  SessionStart: onSessionStart,
  Stop: onStop,
  PostToolUse: onPostToolUse,
};

export function runHook(vaultDir: string, event: string, stdinJson: string): string {
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
    const { state: next, response } = handler(payload, vaultDir, config, state);
    saveState(vaultDir, next);
    return JSON.stringify(response ?? {});
  } catch {
    return '{}';
  }
}
