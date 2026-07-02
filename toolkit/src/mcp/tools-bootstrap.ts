// toolkit/src/mcp/tools-bootstrap.ts
//
// The bootstrap read-companions for the MCP agent driver. The agent calls
// bootstrap_plan to get the file manifest, then bootstrap_emit per file to get
// the distillation worksheet, distills with its own model, and writes via the
// existing cortex_atomize_apply. Pure reads — no writes here.

import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { discover, type DiscoverResult } from '../atomize/bootstrap/discover.js';
import { buildWorksheet } from '../atomize/bootstrap/ingest.js';
import { assertInVault } from './paths.js';
import type { AtomizeEmitPlan } from '../types.js';

function cfg(vaultDir: string) {
  return loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
}

/** The repo manifest: which files an agent should distill. */
export function bootstrapPlanTool(vaultDir: string): DiscoverResult {
  return discover(vaultDir, cfg(vaultDir));
}

/** The distillation worksheet for one repo file (doc or code). Only serves files
 * that are in the discovery manifest — discover() deliberately excludes
 * gitignored secrets, .cortex/*, node_modules/*, binaries, etc., and this must
 * not become a side-channel to read them anyway. */
export function bootstrapEmitTool(vaultDir: string, args: { path: string; kind: 'doc' | 'code' }): AtomizeEmitPlan {
  assertInVault(vaultDir, args.path);
  const config = cfg(vaultDir);
  const entry = discover(vaultDir, config).files.find(f => f.path === args.path);
  if (!entry) throw new Error(`not a bootstrap-eligible file: ${args.path}`);
  return buildWorksheet(vaultDir, args.path, entry.kind, config); // manifest's kind is authoritative
}
