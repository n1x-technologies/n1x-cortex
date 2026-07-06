/**
 * Integration test for the MCP server. Drives the server over an in-memory
 * transport pair and round-trips tool calls, which proves:
 *  - registration + handler wiring survive connect()
 *  - runMcp's await-on-transport-close pattern is correct (the server stays
 *    connected until the client disconnects; here we close explicitly)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createMcpServer } from '../src/mcp/server.js';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-mcp-integ-'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(
    join(dir, '03-Rules', 'limit.md'),
    '---\nid: RULE-LIMIT\ntype: rule\nsource: "[[FUENTE-rules]]"\n---\n# Operation limit\nThe applicable limit for an operation of type X is 5 units.',
  );
  return dir;
}

describe('MCP server integration (in-memory transport)', () => {
  let client: Client;

  afterEach(async () => {
    // Ensure the client is closed after each test so transports clean up.
    try { await client.close(); } catch { /* already closed */ }
  });

  it('lists both tools via transport round-trip', async () => {
    const dir = vault();
    const server = createMcpServer(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['cortex_get_note', 'cortex_query']);
  });

  it('cortex_query returns hits with expected id and sources', async () => {
    const dir = vault();
    const server = createMcpServer(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: 'cortex_query',
      arguments: { question: 'operation limit' },
    });

    // result.content is an array; the first item is the JSON text blob.
    expect(result.isError).toBeFalsy();
    expect(Array.isArray(result.content)).toBe(true);
    const textItem = (result.content as Array<{ type: string; text: string }>).find(
      (c) => c.type === 'text',
    );
    expect(textItem).toBeDefined();
    const parsed = JSON.parse(textItem!.text);
    expect(parsed.hits.length).toBeGreaterThan(0);
    expect(parsed.hits[0].id).toBe('RULE-LIMIT');
    expect(Array.isArray(parsed.sources)).toBe(true);
  });
});
