// toolkit/src/mcp/tools-bootstrap.ts
//
// The bootstrap read-companions for the MCP agent driver. The agent calls
// bootstrap_plan to get the file manifest, then bootstrap_emit per file to get
// the distillation worksheet, distills with its own model, and writes via the
// existing cortex_atomize_apply. Pure reads — no writes here.

import { resolve, sep } from 'node:path';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { discover, type DiscoverResult } from '../atomize/bootstrap/discover.js';
import { buildWorksheet } from '../atomize/bootstrap/ingest.js';
import type { AtomizeEmitPlan } from '../types.js';

function cfg(vaultDir: string) {
  return loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
}

/** Reject a path that escapes the vault. */
function assertInVault(vaultDir: string, rel: string): void {
  const abs = resolve(vaultDir, rel);
  const root = resolve(vaultDir);
  if (abs !== root && !abs.startsWith(root + sep)) throw new Error(`path escapes the vault: ${rel}`);
}

/** The repo manifest: which files an agent should distill. */
export function bootstrapPlanTool(vaultDir: string): DiscoverResult {
  return discover(vaultDir, cfg(vaultDir));
}

/** The distillation worksheet for one repo file (doc or code). */
export function bootstrapEmitTool(vaultDir: string, args: { path: string; kind: 'doc' | 'code' }): AtomizeEmitPlan {
  assertInVault(vaultDir, args.path);
  return buildWorksheet(vaultDir, args.path, args.kind, cfg(vaultDir));
}
