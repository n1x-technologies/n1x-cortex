import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../mcp/server.js';

export async function runMcp(vaultDir: string): Promise<void> {
  const server = createMcpServer(vaultDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The transport keeps the process alive on stdio; resolve only on disconnect.
}
