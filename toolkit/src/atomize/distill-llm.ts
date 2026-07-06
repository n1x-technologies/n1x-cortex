// toolkit/src/atomize/distill-llm.ts
//
// The no-agent distillation path. It sits exactly in the seam the MCP agent and
// the Claude skill occupy: between emitPlan (data + methodology) and
// applyDistilledInput (reversible write). The LlmClient is injected so this is
// unit-testable without a network, and so the CLI owns provider/key wiring.

import { emitPlan } from './emit.js';
import { applyDistilledInput } from './apply-distilled.js';
import type { LlmClient } from './llm-client.js';
import type { AtomizeEmitPlan, DistilledInput, DistilledApplyResult, CortexConfig } from '../types.js';

/** System = the portable methodology; user = the worksheet as JSON. */
export function buildDistillPrompt(plan: AtomizeEmitPlan): { system: string; user: string } {
  const { instructions, ...worksheet } = plan;
  return { system: instructions, user: JSON.stringify(worksheet) };
}

/**
 * Parse the model's reply into distilled specs. Models often wrap JSON in a
 * ```json fence or surround it with prose, so we extract the first balanced
 * object. `source` is forced to the real source path — never trusted from the
 * model — so citations stay correct.
 */
export function parseDistilledResponse(text: string, source: string): DistilledInput {
  const raw = extractJsonObject(text);
  if (!raw) throw new Error(`Could not parse a JSON object from the model response:\n${text.slice(0, 500)}`);
  let parsed: { notes?: unknown };
  try {
    parsed = JSON.parse(raw) as { notes?: unknown };
  } catch (e) {
    throw new Error(`Could not parse model response as JSON (${(e as Error).message}):\n${raw.slice(0, 500)}`);
  }
  if (!Array.isArray(parsed.notes)) throw new Error('Model response has no "notes" array');
  return { source, notes: parsed.notes as DistilledInput['notes'] };
}

/** First `{ … }` block, unwrapping a ```json fence if present. */
function extractJsonObject(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

/** Distill an already-built worksheet (doc OR code). The seam bootstrap reuses. Dry-run by default. */
export async function distillWorksheetWithLlm(
  vaultDir: string,
  worksheet: AtomizeEmitPlan,
  config: CortexConfig,
  client: LlmClient,
  opts: { write?: boolean; force?: boolean; runId?: string } = {},
): Promise<DistilledApplyResult> {
  const { system, user } = buildDistillPrompt(worksheet);
  const reply = await client.complete(system, user);
  const input = parseDistilledResponse(reply, worksheet.source);
  return applyDistilledInput(vaultDir, input, config, { dryRun: !opts.write, force: opts.force, runId: opts.runId });
}

/** emit → distill the markdown worksheet. Thin wrapper over distillWorksheetWithLlm. */
export async function distillWithLlm(
  vaultDir: string,
  sourcePath: string,
  config: CortexConfig,
  client: LlmClient,
  opts: { write?: boolean; force?: boolean } = {},
): Promise<DistilledApplyResult> {
  const worksheet = emitPlan(vaultDir, sourcePath, config);
  return distillWorksheetWithLlm(vaultDir, worksheet, config, client, opts);
}
