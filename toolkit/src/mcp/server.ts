import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { loadStore } from '../semantic/store.js';
import { createTransformersEmbedder, type Embedder } from '../semantic/embedder.js';
import { queryTool, getNoteTool } from './tools.js';

/**
 * Builds the Cortex MCP server for a vault. The embedding model is created at
 * most once (only when a fresh store exists) and reused across queries.
 */
export function createMcpServer(vaultDir: string): McpServer {
  const server = new McpServer({ name: 'cortex', version: '0.1.0' });

  // Warm embedder, memoized for the life of the process. The in-flight promise
  // is stored (not the resolved value) so concurrent first-calls share one load
  // rather than each racing to start a second model initialisation.
  let warmP: Promise<Embedder | undefined> | undefined;
  function warmEmbedder(): Promise<Embedder | undefined> {
    if (!warmP) {
      warmP = (async (): Promise<Embedder | undefined> => {
        const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
        const store = loadStore(resolve(vaultDir, config.embedDir));
        if (!store || store.model !== config.embedModel) return undefined;
        try {
          return await createTransformersEmbedder(config.embedModel, resolve(vaultDir, '.cortex/models'));
        } catch {
          return undefined; // optional peer absent or model load failed → lexical
        }
      })();
    }
    return warmP;
  }

  server.registerTool(
    'cortex_query',
    {
      title: 'Cortex query',
      description:
        'Query the markdown knowledge vault. Returns ranked, cited notes (hybrid lexical + semantic) as JSON: each hit has id, title, path, excerpt and source; plus a sources list for provenance.',
      inputSchema: {
        question: z.string().describe('Natural-language question to ask the vault'),
        maxHits: z.number().int().positive().optional().describe('Max hits to return (default 8)'),
      },
    },
    async ({ question, maxHits }) => {
      try {
        const result = await queryTool(vaultDir, { question, maxHits }, await warmEmbedder());
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: (e as Error).message }] };
      }
    },
  );

  server.registerTool(
    'cortex_get_note',
    {
      title: 'Cortex get note',
      description: 'Fetch the full content of a single note by its id or vault-relative path.',
      inputSchema: {
        id: z.string().optional().describe('Note id (frontmatter id or filename stem)'),
        path: z.string().optional().describe('Vault-relative path, e.g. 03-Rules/limit.md'),
      },
    },
    async ({ id, path }) => {
      try {
        const note = getNoteTool(vaultDir, { id, path });
        return { content: [{ type: 'text' as const, text: JSON.stringify(note, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: (e as Error).message }] };
      }
    },
  );

  return server;
}
