// toolkit/src/commands/bootstrap.ts
//
// The CLI bootstrap engine: discover every eligible repo file, distill each
// into concept drafts, and journal the whole run under ONE shared runId.
// Reversibility guarantee: a single `cortex undo` reverses every draft this
// run CREATED (the primary "document from zero" case). If the run also
// UPDATED existing notes, those backups are journaled under the same runId
// but as a separate record, so a second `cortex undo` may be needed to
// restore them too. Continue-on-error — one bad file never aborts the run.
// Dry-run by default.

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
  opts: { write?: boolean; force?: boolean; runId?: string; onProgress?: (line: string) => void } = {},
): Promise<BootstrapResult> {
  const write = opts.write ?? false;
  const runId = opts.runId ?? makeRunId();
  const config = loadConfig(root, collectFrontmatterKeys(root));
  const { files, skipped } = discover(root, config);

  if (!write) {
    // Dry-run is a free preview: list what WOULD be distilled, but never call
    // the model. On a repo with hundreds of files, a "dry-run" that still
    // fires hundreds of billed LLM calls is a cost footgun.
    return {
      files: files.length,
      notes: 0,
      skipped: skipped.length,
      failures: [],
      perFile: files.map(f => ({ path: f.path, notes: 0 })),
      dryRun: true,
      runId,
    };
  }

  const failures: { path: string; error: string }[] = [];
  const perFile: { path: string; notes: number }[] = [];
  const allCreated: string[] = [];

  for (const file of files) {
    try {
      const worksheet = buildWorksheet(root, file.path, file.kind, config);
      const res = await distillWorksheetWithLlm(root, worksheet, config, client, { write, force: opts.force, runId });
      perFile.push({ path: file.path, notes: res.written.length });
      allCreated.push(...res.written);
      opts.onProgress?.(`  • ${file.path} → ${res.written.length} note(s)`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failures.push({ path: file.path, error: message });
      opts.onProgress?.(`  ✗ ${file.path}: ${message.split('\n')[0]}`);
    }
  }

  // Journal ALL created drafts under the one runId exactly once (recordCreations
  // overwrites its {runId}.json, so it must be called a single time).
  if (allCreated.length) recordCreations(root, allCreated, runId);

  return {
    files: files.length,
    notes: allCreated.length,
    skipped: skipped.length,
    failures,
    perFile,
    dryRun: false,
    runId,
  };
}

export function formatBootstrap(r: BootstrapResult): string {
  const lines: string[] = [];
  if (r.dryRun) {
    lines.push(`Bootstrap (dry-run): ${r.files} file(s) would be distilled · ${r.skipped} skipped · calls no model`);
    for (const f of r.perFile) lines.push(`  • ${f.path}`);
    lines.push('Pass --write to distill and draft notes into _inbox/.');
    return lines.join('\n');
  }
  lines.push(`Bootstrap: ${r.files} file(s) · ${r.notes} note(s) · ${r.skipped} skipped · ${r.failures.length} failed`);
  for (const f of r.failures) lines.push(`  ✗ ${f.path}: ${f.error.split('\n')[0]}`);
  lines.push('Next: open the graph with `cortex viz`  ·  undo with `cortex undo`');
  return lines.join('\n');
}
