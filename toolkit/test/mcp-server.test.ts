import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../src/mcp/server.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('createMcpServer', () => {
  it('constructs an MCP server for a vault without throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-mcpsrv-'));
    const server = createMcpServer(dir);
    expect(server).toBeTruthy();
    // The McpServer instance exposes a low-level `.server` per the SDK.
    expect((server as unknown as { server?: unknown }).server).toBeTruthy();
  });
});
