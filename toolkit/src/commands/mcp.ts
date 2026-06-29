import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../mcp/server.js';
import type { WriteScope } from '../mcp/audit.js';
import {
  Scope, mcpServerSpec, resolveCliPath, hasClaudeCli,
  writeProjectConfig, removeProjectConfig,
} from '../mcp/install.js';

/** Parse the `--write[=draft|curate]` flag. Bare `--write` means draft scope. */
export function parseWriteScope(rest: string[]): WriteScope | 'invalid' {
  const flag = rest.find(a => a === '--write' || a.startsWith('--write='));
  if (!flag) return 'none';
  if (flag === '--write') return 'draft';
  const val = flag.slice('--write='.length);
  return val === 'draft' || val === 'curate' ? val : 'invalid';
}

export async function runMcp(vaultDir: string, writeScope: WriteScope = 'none'): Promise<void> {
  const server = createMcpServer(vaultDir, writeScope);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stay alive on stdio until the client disconnects (EOF / transport close).
  // StdioServerTransport.onclose fires when stdin closes; the stdin 'data'
  // listener already keeps the Node event loop alive, so this promise is the
  // only thing that needs to resolve to let process.exit() fire on disconnect.
  await new Promise<void>((resolve) => { transport.onclose = resolve; });
}

function parseArgs(cwd: string, rest: string[]): { vault: string; scope: Scope; writeScope: WriteScope } {
  const vi = rest.indexOf('--vault');
  const vault = vi >= 0 && rest[vi + 1] ? resolve(cwd, rest[vi + 1]) : cwd;
  const si = rest.indexOf('--scope');
  const s = si >= 0 ? rest[si + 1] : undefined;
  const scope: Scope = s === 'project' || s === 'user' || s === 'local' ? s : 'local';
  const ws = parseWriteScope(rest);
  const writeScope: WriteScope = ws === 'invalid' ? 'none' : ws;
  return { vault, scope, writeScope };
}

/** Register the Cortex MCP server with Claude Code. */
export function runMcpInstall(cwd: string, rest: string[]): number {
  const { vault, scope, writeScope } = parseArgs(cwd, rest);
  const spec = mcpServerSpec(resolveCliPath(), vault, writeScope);
  const manual = `  claude mcp add cortex --scope ${scope} -- ${spec.command} ${spec.args.join(' ')}`;

  if (hasClaudeCli()) {
    // Idempotent: drop any prior registration first (ignore failure), then add.
    spawnSync('claude', ['mcp', 'remove', 'cortex', '--scope', scope], { stdio: 'ignore' });
    const add = spawnSync('claude', ['mcp', 'add', 'cortex', '--scope', scope, '--', spec.command, ...spec.args], { stdio: 'inherit' });
    if (add.status !== 0) {
      console.error('`claude mcp add` failed. Register manually:');
      console.error(manual);
      return 1;
    }
    console.log(`Registered Cortex MCP server (scope: ${scope}, vault: ${vault}).`);
    console.log('Verify with: claude mcp list');
    return 0;
  }

  if (scope === 'project') {
    const file = writeProjectConfig(vault, spec);
    console.log(`Wrote ${file} (cortex server, vault: ${vault}).`);
    console.log('Verify with: claude mcp list');
    return 0;
  }

  console.error('The `claude` CLI was not found on PATH. Register manually:');
  console.error(manual);
  return 1;
}

/** Remove the Cortex MCP registration. */
export function runMcpUninstall(cwd: string, rest: string[]): number {
  const { vault, scope } = parseArgs(cwd, rest);
  if (hasClaudeCli()) {
    const r = spawnSync('claude', ['mcp', 'remove', 'cortex', '--scope', scope], { stdio: 'inherit' });
    console.log(r.status === 0 ? `Removed Cortex MCP server (scope: ${scope}).` : 'Cortex MCP server was not registered.');
    return 0;
  }
  const removed = removeProjectConfig(vault);
  console.log(removed ? `Removed cortex from ${vault}/.mcp.json.` : 'No Cortex MCP registration found.');
  return 0;
}
