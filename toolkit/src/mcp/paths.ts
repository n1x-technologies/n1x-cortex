// toolkit/src/mcp/paths.ts
//
// Shared path guard for the MCP tool surface.

import { resolve, sep } from 'node:path';

/** Reject a vault-relative path that resolves outside the vault. */
export function assertInVault(vaultDir: string, rel: string, label = 'path'): void {
  const abs = resolve(vaultDir, rel);
  const root = resolve(vaultDir);
  if (abs !== root && !abs.startsWith(root + sep)) throw new Error(`${label} escapes the vault: ${rel}`);
}
