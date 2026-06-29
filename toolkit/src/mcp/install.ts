import { realpathSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

export type Scope = 'local' | 'project' | 'user';

export interface ServerSpec {
  command: string;
  args: string[];
}

/** The registration spec: always `node <abs cli.js> mcp <vault>` (robust cross-platform, incl. Windows shims). */
export function mcpServerSpec(cliPath: string, vault: string): ServerSpec {
  return { command: 'node', args: [cliPath, 'mcp', vault] };
}

/**
 * Absolute path to the installed `dist/cli.js`. This module compiles to
 * `dist/mcp/install.js`, so the CLI entry sits one directory up. realpathSync
 * resolves npm/npx symlinks so the registered command points at the real file.
 */
export function resolveCliPath(): string {
  const here = realpathSync(fileURLToPath(import.meta.url)); // .../dist/mcp/install.js
  return resolve(dirname(here), '..', 'cli.js');             // .../dist/cli.js
}

/** True when the `claude` CLI is on PATH. */
export function hasClaudeCli(): boolean {
  const probe = process.platform === 'win32'
    ? spawnSync('where', ['claude'], { stdio: 'ignore' })
    : spawnSync('which', ['claude'], { stdio: 'ignore' });
  return probe.status === 0;
}

/**
 * Merge the `cortex` server into the vault's `.mcp.json` (project scope),
 * preserving any other configured servers. Idempotent: re-running overwrites
 * only the `cortex` key.
 */
export function writeProjectConfig(vault: string, spec: ServerSpec): string {
  const file = join(vault, '.mcp.json');
  let json: Record<string, unknown> = {};
  if (existsSync(file)) {
    try { json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; } catch { json = {}; }
  }
  const servers = (json.mcpServers && typeof json.mcpServers === 'object')
    ? json.mcpServers as Record<string, unknown>
    : {};
  servers.cortex = spec;
  json.mcpServers = servers;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  return file;
}

/** Remove only the `cortex` key from the vault's `.mcp.json`. Returns true if it was present. */
export function removeProjectConfig(vault: string): boolean {
  const file = join(vault, '.mcp.json');
  if (!existsSync(file)) return false;
  let json: Record<string, unknown>;
  try { json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; } catch { return false; }
  const servers = json.mcpServers as Record<string, unknown> | undefined;
  if (servers && 'cortex' in servers) {
    delete servers.cortex;
    writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    return true;
  }
  return false;
}
