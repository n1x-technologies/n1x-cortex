// toolkit/src/commands/bootstrap.ts
//
// The CLI bootstrap engine: discover every eligible repo file, distill each
// into concept drafts, and journal the whole run under ONE shared runId so
// `cortex undo` reverses it in a single call. Continue-on-error — one bad file
// never aborts the run. Dry-run by default.

import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { discover } from '../atomize/bootstrap/discover.js';
import { buildWorksheet } from '../atomize/bootstrap/ingest.js';
import { distillWorksheetWithLlm } from '../atomize/distill-llm.js';
import { recordCreations } from '../atomize/backup.js';
import type { LlmClient } from '../atomize/llm-client.js';

export interface BootstrapResult {
  files: number;
  notes: number;
  skipped: number;
  failures: { path: string; error: string }[];
  perFile: { path: string; notes: number }[];
  dryRun: boolean;
  runId: string;
}

function makeRunId(): string {
  return `bootstrap-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

export async function runBootstrap(
  root: string,
  client: LlmClient,
  opts: { write?: boolean; force?: boolean; runId?: string } = {},
): Promise<BootstrapResult> {
  const write = opts.write ?? false;
  const runId = opts.runId ?? makeRunId();
  const config = loadConfig(root, collectFrontmatterKeys(root));
  const { files, skipped } = discover(root, config);

  const failures: { path: string; error: string }[] = [];
  const perFile: { path: string; notes: number }[] = [];
  const allCreated: string[] = [];

  for (const file of files) {
    try {
      const worksheet = buildWorksheet(root, file.path, file.kind, config);
      const res = await distillWorksheetWithLlm(root, worksheet, config, client, { write, force: opts.force, runId });
      perFile.push({ path: file.path, notes: res.written.length });
      allCreated.push(...res.written);
    } catch (e) {
      failures.push({ path: file.path, error: (e as Error).message });
    }
  }

  // Journal ALL created drafts under the one runId exactly once (recordCreations
  // overwrites its {runId}.json, so it must be called a single time).
  if (write && allCreated.length) recordCreations(root, allCreated, runId);

  return {
    files: files.length,
    notes: allCreated.length,
    skipped: skipped.length,
    failures,
    perFile,
    dryRun: !write,
    runId,
  };
}

export function formatBootstrap(r: BootstrapResult): string {
  const lines: string[] = [];
  lines.push(`Bootstrap: ${r.files} file(s) · ${r.notes} note(s) · ${r.skipped} skipped · ${r.failures.length} failed`);
  lines.push(r.dryRun ? '(dry-run — nothing written; pass --write to apply)' : `wrote ${r.notes} draft(s) to _inbox/`);
  for (const f of r.perFile) if (f.notes) lines.push(`  • ${f.path} → ${f.notes} note(s)`);
  for (const f of r.failures) lines.push(`  ✗ ${f.path}: ${f.error.split('\n')[0]}`);
  if (!r.dryRun && r.notes) lines.push('Next: open the graph with `cortex viz`  ·  undo the run with `cortex undo`');
  return lines.join('\n');
}
