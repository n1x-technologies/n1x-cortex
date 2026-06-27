// toolkit/test/mcp-install.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcpServerSpec, writeProjectConfig, removeProjectConfig } from '../src/mcp/install.js';

function tmpVault(): string {
  return mkdtempSync(join(tmpdir(), 'cortex-mcp-install-'));
}

describe('mcpServerSpec', () => {
  it('always registers `node <cli> mcp <vault>`', () => {
    const spec = mcpServerSpec('/abs/dist/cli.js', '/my/vault');
    expect(spec).toEqual({ command: 'node', args: ['/abs/dist/cli.js', 'mcp', '/my/vault'] });
  });
});

describe('writeProjectConfig (.mcp.json merge)', () => {
  it('adds the cortex server while preserving existing servers', () => {
    const vault = tmpVault();
    writeFileSync(join(vault, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x', args: [] } } }));
    writeProjectConfig(vault, mcpServerSpec('/dist/cli.js', vault));
    const json = JSON.parse(readFileSync(join(vault, '.mcp.json'), 'utf8'));
    expect(json.mcpServers.other).toBeDefined();
    expect(json.mcpServers.cortex).toEqual({ command: 'node', args: ['/dist/cli.js', 'mcp', vault] });
  });

  it('creates .mcp.json when absent', () => {
    const vault = tmpVault();
    writeProjectConfig(vault, mcpServerSpec('/dist/cli.js', vault));
    const json = JSON.parse(readFileSync(join(vault, '.mcp.json'), 'utf8'));
    expect(json.mcpServers.cortex.args).toEqual(['/dist/cli.js', 'mcp', vault]);
  });

  it('is idempotent — running twice yields a single cortex entry', () => {
    const vault = tmpVault();
    writeProjectConfig(vault, mcpServerSpec('/dist/cli.js', vault));
    writeProjectConfig(vault, mcpServerSpec('/dist/cli.js', vault));
    const json = JSON.parse(readFileSync(join(vault, '.mcp.json'), 'utf8'));
    expect(Object.keys(json.mcpServers)).toEqual(['cortex']);
  });
});

describe('removeProjectConfig', () => {
  it('removes only the cortex key', () => {
    const vault = tmpVault();
    writeFileSync(join(vault, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x', args: [] }, cortex: { command: 'node', args: [] } } }));
    const removed = removeProjectConfig(vault);
    const json = JSON.parse(readFileSync(join(vault, '.mcp.json'), 'utf8'));
    expect(removed).toBe(true);
    expect(json.mcpServers.cortex).toBeUndefined();
    expect(json.mcpServers.other).toBeDefined();
  });

  it('returns false when there is nothing to remove', () => {
    const vault = tmpVault();
    expect(removeProjectConfig(vault)).toBe(false);
  });
});
