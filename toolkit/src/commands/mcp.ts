import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../mcp/server.js';

export async function runMcp(vaultDir: string): Promise<void> {
  const server = createMcpServer(vaultDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stay alive on stdio until the client disconnects (EOF / transport close).
  // StdioServerTransport.onclose fires when stdin closes; the stdin 'data'
  // listener already keeps the Node event loop alive, so this promise is the
  // only thing that needs to resolve to let process.exit() fire on disconnect.
  await new Promise<void>((resolve) => { transport.onclose = resolve; });
}
