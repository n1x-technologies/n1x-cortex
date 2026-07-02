import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { loadStore } from '../semantic/store.js';
import { createTransformersEmbedder, type Embedder } from '../semantic/embedder.js';
import { queryTool, getNoteTool } from './tools.js';
import {
  atomizeEmitTool, dupesTool, gapsTool,
  atomizeApplyTool, setStatusTool, promoteTool, mergeTool, undoTool,
  type WriteToolOut,
} from './tools-write.js';
import { appendWriteAudit, type WriteScope } from './audit.js';

const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: (e as Error).message }] });

const distilledNote = z.object({
  title: z.string(),
  type: z.string().nullable().optional(),
  folder: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  body: z.string(),
  fromHeading: z.string().optional(),
  action: z.enum(['create', 'update']).optional(),
  targetPath: z.string().optional(),
});

/**
 * Builds the Cortex MCP server for a vault. Read tools are always registered;
 * write/curate tools are registered only for the chosen `writeScope`, which the
 * human selects at launch (`cortex mcp --write[=draft|curate]`) — an agent can
 * never enable or escalate its own write surface.
 *
 * The embedding model is created at most once (only when a fresh store exists)
 * and reused across queries.
 */
export function createMcpServer(vaultDir: string, writeScope: WriteScope = 'none'): McpServer {
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

  // ── Read tools (always on) ────────────────────────────────────────
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
        return json(await queryTool(vaultDir, { question, maxHits }, await warmEmbedder()));
      } catch (e) {
        return fail(e);
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
        return json(getNoteTool(vaultDir, { id, path }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  if (writeScope === 'none') return server;

  // ── Write gate: per-session committed-write cap + audit log ────────
  const maxWrites = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir)).mcpMaxWritesPerSession;
  let writes = 0;

  /** Run a write handler under the cap, then audit the outcome. `exempt` writes
   *  (undo) bypass the cap so the escape hatch is always available. */
  function guarded<T>(tool: string, summary: string, exempt: boolean, run: () => WriteToolOut<T>) {
    try {
      if (!exempt && writes >= maxWrites) {
        appendWriteAudit(vaultDir, { tool, write: false, summary, result: `rejected: write cap (${maxWrites}) reached` });
        return fail(new Error(`MCP write cap reached (${maxWrites} per session). Reads still work; run \`cortex undo\` to revert, then restart the server to reset.`));
      }
      const out = run();
      if (!out.dryRun && !exempt) writes++;
      appendWriteAudit(vaultDir, { tool, write: !out.dryRun, runId: out.runId, summary, result: out.dryRun ? 'dry-run' : 'committed' });
      return json(out);
    } catch (e) {
      appendWriteAudit(vaultDir, { tool, write: false, summary, result: `error: ${(e as Error).message}` });
      return fail(e);
    }
  }

  // ── Read companions for the curate loop (no cap, no audit) ─────────
  server.registerTool(
    'cortex_atomize_emit',
    {
      title: 'Cortex atomize — emit worksheet',
      description:
        'Read a source under the vault and return the distillation worksheet (segments + existing-note context) so YOU, the calling agent, can distill it into note specs to pass to cortex_atomize_apply. Follow the `instructions` field in the returned worksheet to distill with quality. Read-only.',
      inputSchema: { source: z.string().describe('Vault-relative source path, e.g. Markdown/spec.md') },
    },
    async ({ source }) => {
      try {
        return json(atomizeEmitTool(vaultDir, { source }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'cortex_dupes',
    {
      title: 'Cortex dupes',
      description: 'List near-duplicate note pairs (merge candidates for cortex_merge). Read-only.',
      inputSchema: {
        threshold: z.number().optional().describe('Similarity threshold (default from config)'),
        crossType: z.boolean().optional().describe('Allow pairs across different note types'),
      },
    },
    async ({ threshold, crossType }) => {
      try {
        return json(dupesTool(vaultDir, { threshold, crossType }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'cortex_gaps',
    {
      title: 'Cortex gaps',
      description: 'Report knowledge gaps — unatomized/stale sources, notes missing citations, stuck drafts. Read-only.',
      inputSchema: {},
    },
    async () => {
      try {
        return json(gapsTool(vaultDir));
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ── Write — draft scope ───────────────────────────────────────────
  server.registerTool(
    'cortex_atomize_apply',
    {
      title: 'Cortex atomize — apply drafts',
      description:
        'Write your distilled notes into the vault: new notes become status:draft files in _inbox/, matches are updated in place. Dry-run by default — pass write:true to commit. Every write is backed up and reversible with cortex_undo.',
      inputSchema: {
        source: z.string().describe('The source these notes were distilled from (citation)'),
        notes: z.array(distilledNote).describe('Distilled note specs (same shape /atomize emits)'),
        write: z.boolean().optional().describe('Commit the writes (default false = preview only)'),
        force: z.boolean().optional().describe('Bypass the update shrink-guard'),
      },
    },
    async ({ source, notes, write, force }) =>
      guarded('cortex_atomize_apply', `source=${source} notes=${notes.length}`, false,
        () => atomizeApplyTool(vaultDir, { source, notes, write, force })),
  );

  server.registerTool(
    'cortex_set_status',
    {
      title: 'Cortex set status',
      description:
        "Advance a note's lifecycle status (e.g. draft → documented). Dry-run by default — pass write:true to commit. Backed up and reversible.",
      inputSchema: {
        path: z.string().describe('Vault-relative note path'),
        status: z.string().describe('New status value'),
        write: z.boolean().optional().describe('Commit the change (default false = preview only)'),
      },
    },
    async ({ path, status, write }) =>
      guarded('cortex_set_status', `path=${path} status=${status}`, false,
        () => setStatusTool(vaultDir, { path, status, write })),
  );

  server.registerTool(
    'cortex_undo',
    {
      title: 'Cortex undo',
      description: 'Reverse the latest write run (restores backups / rolls back promotions and creations). The self-correction primitive — never capped.',
      inputSchema: {},
    },
    async () => guarded('cortex_undo', '', true, () => undoTool(vaultDir)),
  );

  if (writeScope !== 'curate') return server;

  // ── Write — curate scope ──────────────────────────────────────────
  server.registerTool(
    'cortex_promote',
    {
      title: 'Cortex promote',
      description:
        'Graduate status-advanced drafts out of _inbox/ into their curated folders. Dry-run by default — pass write:true to commit. Reversible with cortex_undo.',
      inputSchema: { write: z.boolean().optional().describe('Commit the moves (default false = preview only)') },
    },
    async ({ write }) =>
      guarded('cortex_promote', '', false, () => promoteTool(vaultDir, { write })),
  );

  server.registerTool(
    'cortex_merge',
    {
      title: 'Cortex merge',
      description:
        'Fold a near-duplicate pair into one note: keep `keep`, replace it with your merged `content`, redirect inbound links, delete `drop`. Dry-run by default — pass write:true to commit. Reversible with cortex_undo.',
      inputSchema: {
        keep: z.string().describe('Vault-relative path of the note to keep'),
        drop: z.string().describe('Vault-relative path of the note to fold in and delete'),
        content: z.string().describe('The merged note body that replaces `keep`'),
        write: z.boolean().optional().describe('Commit the merge (default false = preview only)'),
      },
    },
    async ({ keep, drop, content, write }) =>
      guarded('cortex_merge', `keep=${keep} drop=${drop}`, false,
        () => mergeTool(vaultDir, { keep, drop, content, write })),
  );

  return server;
}
