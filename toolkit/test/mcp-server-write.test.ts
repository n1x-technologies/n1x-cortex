import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpServer } from '../src/mcp/server.js';
import { parseWriteScope } from '../src/commands/mcp.js';
import type { WriteScope } from '../src/mcp/audit.js';

function vault(extra?: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-mcpsw-'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, '03-Rules', 'limit.md'),
    '---\nid: RULE-LIMIT\ntype: rule\nstatus: draft\nsource: "[[FUENTE-rules]]"\n---\n# Operation limit\nThe applicable limit is 5 units.\n');
  if (extra) writeFileSync(join(dir, '.cortex.json'), JSON.stringify(extra));
  return dir;
}

async function connect(dir: string, scope: WriteScope): Promise<Client> {
  const server = createMcpServer(dir, scope);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await server.connect(st);
  await client.connect(ct);
  return client;
}

async function toolNames(dir: string, scope: WriteScope): Promise<string[]> {
  const client = await connect(dir, scope);
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  await client.close();
  return names;
}

describe('parseWriteScope', () => {
  it('maps the flag forms', () => {
    expect(parseWriteScope([])).toBe('none');
    expect(parseWriteScope(['--write'])).toBe('draft');
    expect(parseWriteScope(['--write=draft'])).toBe('draft');
    expect(parseWriteScope(['--write=curate'])).toBe('curate');
    expect(parseWriteScope(['--write=bogus'])).toBe('invalid');
  });
});

describe('scope-gated tool registration', () => {
  it("'none' (default) exposes only the two read tools", async () => {
    expect(await toolNames(vault(), 'none')).toEqual(['cortex_get_note', 'cortex_query']);
  });

  it("'draft' adds capture tools but NOT promote/merge", async () => {
    const names = await toolNames(vault(), 'draft');
    expect(names).toContain('cortex_atomize_emit');
    expect(names).toContain('cortex_atomize_apply');
    expect(names).toContain('cortex_set_status');
    expect(names).toContain('cortex_undo');
    expect(names).toContain('cortex_dupes');
    expect(names).toContain('cortex_gaps');
    expect(names).not.toContain('cortex_promote');
    expect(names).not.toContain('cortex_merge');
  });

  it("'curate' adds promote + merge on top of draft", async () => {
    const names = await toolNames(vault(), 'curate');
    expect(names).toContain('cortex_promote');
    expect(names).toContain('cortex_merge');
    expect(names).toContain('cortex_atomize_apply');
  });
});

describe('write cap + audit', () => {
  let client: Client;
  afterEach(async () => { try { await client.close(); } catch { /* closed */ } });

  async function callStatus(c: Client, dir: string, status: string) {
    return c.callTool({ name: 'cortex_set_status', arguments: { path: '03-Rules/limit.md', status, write: true } });
  }

  it('rejects committed writes past mcpMaxWritesPerSession; undo stays exempt', async () => {
    const dir = vault({ mcpMaxWritesPerSession: 1 });
    client = await connect(dir, 'draft');

    const first = await callStatus(client, dir, 'documented');
    expect(first.isError).toBeFalsy();

    const second = await callStatus(client, dir, 'verified');
    expect(second.isError).toBe(true);
    const msg = (second.content as Array<{ text: string }>)[0].text;
    expect(msg).toMatch(/write cap reached/);

    // The escape hatch is never capped.
    const undo = await client.callTool({ name: 'cortex_undo', arguments: {} });
    expect(undo.isError).toBeFalsy();
  });

  it('dry-runs do not count toward the cap', async () => {
    const dir = vault({ mcpMaxWritesPerSession: 1 });
    client = await connect(dir, 'draft');
    // A preview (write omitted) should not consume the single write budget.
    await client.callTool({ name: 'cortex_set_status', arguments: { path: '03-Rules/limit.md', status: 'documented' } });
    const commit = await callStatus(client, dir, 'documented');
    expect(commit.isError).toBeFalsy();
  });

  it('writes an audit line to .cortex/mcp-writes.log', async () => {
    const dir = vault();
    client = await connect(dir, 'draft');
    await callStatus(client, dir, 'documented');
    const log = join(dir, '.cortex', 'mcp-writes.log');
    expect(existsSync(log)).toBe(true);
    const lines = readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const entry = lines.find(e => e.tool === 'cortex_set_status');
    expect(entry).toBeDefined();
    expect(entry.write).toBe(true);
    expect(entry.result).toBe('committed');
    expect(entry.runId).toMatch(/-mcp$/);
  });
});
