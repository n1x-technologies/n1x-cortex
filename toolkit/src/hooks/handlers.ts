// toolkit/src/hooks/handlers.ts
import { relative, sep } from 'node:path';
import { scanVault } from '../vault.js';
import { snapshotSources, reconcile, clearDirty, markDirty, type HookState } from './state.js';
import { runQuery, formatQuery } from '../commands/query.js';
import { shouldCapture, type CaptureMode } from '../capture/guard.js';
import type { CortexConfig } from '../types.js';

export interface HookResponse {
  systemMessage?: string;
  hookSpecificOutput?: { hookEventName: string; additionalContext?: string };
}
/** A request (not an act) to spawn a background capture — the impure spawn happens in dispatch. */
export interface CaptureIntent { mode: CaptureMode; sources: string[]; }
export interface HandlerResult { state: HookState; response: HookResponse; capture?: CaptureIntent; }
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

  // Phase 7 — autonomous capture: auto-draft/full spawn a background /atomize run.
  const decision = shouldCapture(reconciled, config, Date.now());
  if (decision.ok && decision.mode) {
    const sources = [...reconciled.dirty];
    const line = `Cortex: capturing ${sources.length} source(s) in the background`;
    return {
      state: clearDirty(reconciled),
      response: { systemMessage: line },
      capture: { mode: decision.mode, sources },
    };
  }

  // suggest: announce and clear (Phase 4). auto-draft/full that declined for a transient
  // reason (cooldown / session-cap) stay quiet and keep the sources dirty so a later Stop
  // retries — clearing would lose them, since the snapshot is already reconciled.
  if (config.autonomy === 'suggest') {
    const line = `Cortex: ${reconciled.dirty.length} source(s) changed — run /atomize to distill`;
    return { state: clearDirty(reconciled), response: { systemMessage: line } };
  }
  return { state: reconciled, response: {} };
};

function sourceRelPath(payload: HookPayload, vaultDir: string, config: CortexConfig): string | null {
  const ti = (payload.tool_input ?? {}) as Record<string, unknown>;
  const raw = ti.file_path ?? ti.path ?? ti.notebook_path;
  if (typeof raw !== 'string' || !raw.endsWith('.md')) return null;
  const rel = relative(vaultDir, raw).split(sep).join('/');
  if (rel.startsWith('..')) return null;                       // outside vault
  const prefix = config.sourcesDir.endsWith('/') ? config.sourcesDir : config.sourcesDir + '/';
  return rel.startsWith(prefix) ? rel : null;                  // only under sourcesDir
}

export const onPostToolUse: Handler = (payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const rel = sourceRelPath(payload, vaultDir, config);
  return { state: rel ? markDirty(state, rel) : state, response: {} };
};

const GROUNDING_TOKEN_CAP = 4000;
const QUESTION_WORDS = /^(what|why|how|where|when|who|which|qué|por qué|cómo|dónde|cuándo|quién|cuál)\b/i;

export function looksLikeDomainQuestion(prompt: string): boolean {
  const p = prompt.trim();
  if (p.length < 8) return false;
  return p.endsWith('?') || QUESTION_WORDS.test(p);
}

export const onUserPromptSubmit: Handler = (payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  if (!looksLikeDomainQuestion(prompt)) return { state, response: {} };
  if (state.session.injectedTokens >= GROUNDING_TOKEN_CAP) return { state, response: {} };

  const grounding = formatQuery(runQuery(vaultDir, prompt));
  if (!grounding.trim()) return { state, response: {} };
  const estTokens = Math.ceil(grounding.length / 4);
  const next: HookState = { ...state, session: { ...state.session, injectedTokens: state.session.injectedTokens + estTokens } };
  return {
    state: next,
    response: { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: grounding } },
  };
};

export const onSessionEnd: Handler = (_payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const reconciled = reconcile(state, snapshotSources(vaultDir, config));
  const next: HookState = { ...reconciled, session: { injectedTokens: 0, captureCount: 0 } };
  if (reconciled.dirty.length === 0) return { state: next, response: {} };
  return {
    state: next,
    response: { systemMessage: `Cortex: ${reconciled.dirty.length} source(s) still need atomizing` },
  };
};
