// toolkit/src/mcp/audit.ts
//
// Accountability for agent-driven writes over MCP. Two concerns:
//  - mint a run id that an MCP-originated write carries, so it is identifiable
//    in `.cortex/` and the audit trail;
//  - append one line per write tool call to `.cortex/mcp-writes.log`.
//
// The run id is *timestamp-led* (not `mcp-` prefixed) on purpose: `cortex undo`
// picks the lexicographically greatest run id as "latest", so the id must sort
// chronologically with every other Cortex run. The trailing `-mcp` marker keeps
// it greppable without breaking that ordering.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type WriteScope = 'none' | 'draft' | 'curate';

const LOG = '.cortex/mcp-writes.log';

/** A chronologically-sortable, MCP-identifiable run id (e.g. 2026-06-29T..-mcp). */
export function mintMcpRunId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-mcp`;
}

export interface WriteAuditEntry {
  tool: string;
  write: boolean;        // true = committed, false = dry-run preview
  runId?: string | null; // the run id when a write happened
  summary?: string;      // short, non-sensitive description of the args
  result?: string;       // short description of the outcome
}

/** Append one audit line. Best-effort — auditing never breaks a tool call. */
export function appendWriteAudit(vaultDir: string, entry: WriteAuditEntry): void {
  try {
    const abs = join(vaultDir, LOG);
    mkdirSync(dirname(abs), { recursive: true });
    appendFileSync(abs, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch {
    /* audit is best-effort */
  }
}
