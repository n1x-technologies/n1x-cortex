// toolkit/src/hooks/handlers.ts
import { scanVault } from '../vault.js';
import { snapshotSources, reconcile, clearDirty, type HookState } from './state.js';
import type { CortexConfig } from '../types.js';

export interface HookResponse {
  systemMessage?: string;
  hookSpecificOutput?: { hookEventName: string; additionalContext?: string };
}
export interface HandlerResult { state: HookState; response: HookResponse; }
export type HookPayload = Record<string, unknown>;
export type Handler = (payload: HookPayload, vaultDir: string, config: CortexConfig, state: HookState) => HandlerResult;

export function gate(state: HookState, config: CortexConfig): boolean {
  return !(config.autonomy === 'off' || state.paused);
}

export const onSessionStart: Handler = (_payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const next = reconcile(state, snapshotSources(vaultDir, config));
  const notes = scanVault(vaultDir, config);
  const draft = config.statusLifecycle[0];
  const drafts = notes.filter(n => n.status === draft).length;
  const line = `Cortex: ${notes.length} notes · ${drafts} drafts · ${next.dirty.length} source(s) changed`;
  return { state: next, response: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line } } };
};

export const onStop: Handler = (_payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const reconciled = reconcile(state, snapshotSources(vaultDir, config));
  if (reconciled.dirty.length === 0) return { state: reconciled, response: {} };
  const line = `Cortex: ${reconciled.dirty.length} source(s) changed — run /atomize to distill`;
  return { state: clearDirty(reconciled), response: { systemMessage: line } };
};
