// toolkit/src/mcp/tools-write.ts
//
// The write/curate half of the Cortex MCP surface. Every handler is a thin,
// pure wrapper over an existing reversible engine command — no write, backup or
// reversibility logic is duplicated here. The MCP server (server.ts) wraps these
// with the per-session write cap and the audit log; these functions only do the
// engine call, so they stay trivially testable (run tool → `undoTool` → vault
// back to start).
//
// Shared contract for write handlers: dry-run by default; an explicit `write`
// commits. They return { dryRun, runId, data } so the server can count committed
// writes and record the run id in the audit trail.
import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { loadState } from '../hooks/state.js';
import { emitPlan } from '../atomize/emit.js';
import { applyDistilledInput } from '../atomize/apply-distilled.js';
import { setStatus } from '../atomize/set-status.js';
import { planPromote, applyPromote } from '../atomize/promote.js';
import { runMergeNotes } from '../curate/merge.js';
import { undoLatestRun, recordCreations } from '../atomize/backup.js';
import { computeDupes } from '../curate/dupes.js';
import { computeGaps } from '../curate/gaps.js';
import { mintMcpRunId } from './audit.js';
import { assertInVault } from './paths.js';
import type { DistilledNote, CortexConfig } from '../types.js';

export interface WriteToolOut<T> {
  dryRun: boolean;
  runId: string | null;
  data: T;
}

function cfg(vaultDir: string): CortexConfig {
  return loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
}

// ── Read companions (the curate loop needs them) ───────────────────

/** The distillation worksheet for a source: its segments + existing-note context. */
export function atomizeEmitTool(vaultDir: string, args: { source: string }) {
  assertInVault(vaultDir, args.source, 'source');
  // emitPlan reads the source path directly; resolve it against the vault so the
  // tool works regardless of the server process's cwd.
  return emitPlan(vaultDir, resolve(vaultDir, args.source), cfg(vaultDir));
}

/** Near-duplicate pairs — merge candidates that feed cortex_merge. */
export function dupesTool(vaultDir: string, args: { threshold?: number; crossType?: boolean } = {}) {
  const config = cfg(vaultDir);
  return computeDupes(vaultDir, config, args.threshold ?? config.dupeThreshold, { crossType: args.crossType });
}

/** Knowledge gaps — what is thin enough to be worth capturing. */
export function gapsTool(vaultDir: string) {
  const config = cfg(vaultDir);
  return computeGaps(vaultDir, config, loadState(vaultDir));
}

// ── Write — draft scope (additive; quarantined to _inbox/ + status flips) ──

/** Apply the agent's distilled notes: drafts to _inbox/, in-place updates. Reversible. */
export function atomizeApplyTool(
  vaultDir: string,
  args: { source: string; notes: DistilledNote[]; write?: boolean; force?: boolean },
): WriteToolOut<ReturnType<typeof applyDistilledInput>> {
  const write = args.write ?? false;
  const runId = write ? mintMcpRunId() : null;
  const data = applyDistilledInput(
    vaultDir,
    { source: args.source, notes: args.notes },
    cfg(vaultDir),
    { dryRun: !write, force: args.force, runId: runId ?? undefined },
  );
  // The CLI atomize path does not journal newly-created drafts, so they would
  // survive `undo`. An agent writing unattended needs creates to be reversible
  // too: record them under the run id so cortex_undo deletes them.
  if (write && runId && data.written.length) recordCreations(vaultDir, data.written, runId);
  return { dryRun: !write, runId, data };
}

/** Advance a note's lifecycle status (the gate cortex_promote later reads). Reversible. */
export function setStatusTool(
  vaultDir: string,
  args: { path: string; status: string; write?: boolean },
): WriteToolOut<ReturnType<typeof setStatus>> {
  assertInVault(vaultDir, args.path, 'path');
  const write = args.write ?? false;
  const runId = write ? mintMcpRunId() : null;
  const data = setStatus(vaultDir, args.path, args.status, cfg(vaultDir), {
    dryRun: !write,
    runId: runId ?? undefined,
  });
  return { dryRun: !write, runId, data };
}

// ── Write — curate scope (structural moves; still reversible) ───────

/** Graduate status-advanced drafts out of _inbox/ into curated folders. Reversible. */
export function promoteTool(vaultDir: string, args: { write?: boolean } = {}): WriteToolOut<{
  plan: ReturnType<typeof planPromote>;
  promoted: { from: string; to: string }[];
  skipped: { from: string; reason: string }[];
}> {
  const write = args.write ?? false;
  const config = cfg(vaultDir);
  const plan = planPromote(vaultDir, config);
  const { promoted, skipped } = applyPromote(vaultDir, plan, config, { dryRun: !write });
  return { dryRun: !write, runId: null, data: { plan, promoted, skipped } };
}

/** Fold a near-duplicate pair into one note, redirecting inbound links. Reversible. */
export function mergeTool(
  vaultDir: string,
  args: { keep: string; drop: string; content: string; write?: boolean },
): WriteToolOut<ReturnType<typeof runMergeNotes>> {
  assertInVault(vaultDir, args.keep, 'keep');
  assertInVault(vaultDir, args.drop, 'drop');
  const write = args.write ?? false;
  const data = runMergeNotes(
    vaultDir,
    cfg(vaultDir),
    { keepPath: args.keep, dropPath: args.drop, content: args.content },
    { write },
  );
  return { dryRun: data.dryRun, runId: data.runId, data };
}

// ── Write — the escape hatch (any write scope; never capped) ────────

/** Reverse the latest write run (backup-restore or promotion/creation rollback). */
export function undoTool(vaultDir: string): WriteToolOut<ReturnType<typeof undoLatestRun>> {
  const data = undoLatestRun(vaultDir);
  return { dryRun: false, runId: null, data };
}
