# Cortex MCP server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cortex mcp` command that runs a stdio Model Context Protocol server exposing two tools — `cortex_query` (cited hybrid query) and `cortex_get_note` (full note) — so AI agents can use the vault as a reliable knowledge source.

**Architecture:** An isolated `src/mcp/` module: pure tool handlers (`tools.ts`) over the existing engine, and a server (`server.ts`) that registers them with the official SDK and keeps the embedding model warm. `commands/mcp.ts` connects a stdio transport. The handlers are SDK-free and unit-tested with a stub embedder; the SDK wiring is validated by a manual smoke.

**Tech Stack:** Node ESM + TypeScript, vitest, `@modelcontextprotocol/sdk` (stdio MCP server), `zod` (tool input schemas), reuses `runQuerySemantic`/`scanVault`/`createTransformersEmbedder`.

## Global Constraints

- **Module system:** Node ESM. Relative imports use explicit `.js` extensions. Tests run from `toolkit/` (`npm test`, vitest); build `npm run build`.
- **Transport:** stdio only. The two tools are exactly `cortex_query` and `cortex_get_note`.
- **Reuse the engine:** tool handlers call `runQuerySemantic` and a note lookup over `scanVault`; no retrieval logic is duplicated.
- **Citations:** every `cortex_query` hit carries `id`, `path`, `excerpt`, `source`; the result has a `sources` array.
- **Warm model:** the server creates the `Embedder` at most **once** (only when a fresh store exists) and reuses it across queries. No store / no peer dep / load failure → lexical-only, the tool still returns.
- **Never crash:** a not-found note or bad input yields a clean error, never a server-process crash. Path lookups match against scanned `note.path` only (no arbitrary file reads → no path escape).
- **Optional peer preserved:** `@xenova/transformers` stays an optional peer (semantic when present, lexical otherwise). The MCP SDK + zod are normal dependencies.
- **SDK version:** pin `@modelcontextprotocol/sdk@^1.11.0` and `zod@^3.23.8`. The v1.x API is: `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'`, `import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'`, and `server.registerTool(name, { title, description, inputSchema /* ZodRawShape */ }, async (args) => ({ content: [{ type: 'text', text }] }))`. If `npm install` resolves a different major or the types reject the `inputSchema` raw-shape form, adapt the registration call to the installed version — the behavior (two tools, stdio, JSON text payload) is fixed, the exact call signature is not.

---

### Task 1: Dependencies + warm-embedder hook in `runQuerySemantic`

**Files:**
- Modify: `toolkit/package.json` (+ `package-lock.json` via install)
- Modify: `toolkit/src/commands/query.ts` (`runQuerySemantic` gains an optional `embedder` param)
- Test: `toolkit/test/query.test.ts` (add a case asserting the param is threaded)

**Interfaces:**
- Produces: `runQuerySemantic(vaultDir: string, question: string, embedder?: Embedder): Promise<QueryResult>` — forwards `embedder` to `semanticQueryRanking` (which already accepts it).
- Consumes: `semanticQueryRanking(vaultDir, config, notes, question, embedder?)` (existing), `Embedder` from `../semantic/embedder.js`.

- [ ] **Step 1: Add the dependencies**

In `toolkit/`, run:
```bash
npm install @modelcontextprotocol/sdk@^1.11.0 zod@^3.23.8
```
Expected: `package.json` `dependencies` gains both; lockfile updates. (These are normal deps, not the optional transformers peer.)

- [ ] **Step 2: Write the failing test**

In `toolkit/test/query.test.ts`, add this case inside the existing `describe('runQuery', ...)` block (it already imports from `../src/commands/query.js` and has the `vault()` helper):
```ts
  it('runQuerySemantic forwards an injected embedder to the semantic ranking', async () => {
    const dir = vault();
    // Inject a stub embedder. With no embedding store in the fixture,
    // semanticQueryRanking returns [] before ever calling the embedder, so the
    // call must still succeed via the lexical path — proving the extra
    // parameter is accepted and threaded through without error.
    const stub = { id: 'stub', dim: 3, async embed() { return []; } };
    const r = await runQuerySemantic(dir, 'operation limit', stub);
    expect(r.hits[0].id).toBe('RULE-LIMIT');
  });
```
Add `runQuerySemantic` to the existing import from `'../src/commands/query.js'` if it is not already imported.

- [ ] **Step 3: Run the test to verify it fails**

Run (from `toolkit/`): `npm test -- query`
Expected: FAIL — `runQuerySemantic` currently takes 2 args; passing a 3rd is a type error (tsc) / the import may be missing.

- [ ] **Step 4: Thread the embedder parameter**

In `toolkit/src/commands/query.ts`, add the import and change `runQuerySemantic`:
```ts
import type { Embedder } from '../semantic/embedder.js';
```
```ts
export async function runQuerySemantic(
  vaultDir: string,
  question: string,
  embedder?: Embedder,
): Promise<QueryResult> {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);
  const semanticRanking = await semanticQueryRanking(vaultDir, config, notes, question, embedder);
  return retrieve(notes, graph, question, { semanticRanking, rrfK: config.rrfK });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `toolkit/`): `npm test -- query`
Expected: PASS (existing query cases + the new one).
Run: `npm test` → full suite PASS. Run `npm run build` → clean.

- [ ] **Step 6: Commit**

```bash
git add toolkit/package.json toolkit/package-lock.json toolkit/src/commands/query.ts toolkit/test/query.test.ts
git commit -m "feat(toolkit): MCP deps + optional warm embedder param on runQuerySemantic"
```

---

### Task 2: Pure tool handlers (`tools.ts`)

**Files:**
- Create: `toolkit/src/mcp/tools.ts`
- Test: `toolkit/test/mcp-tools.test.ts`

**Interfaces:**
- Produces:
  - `QueryHitOut { id: string; title: string; path: string; excerpt: string; source: string | null; score: number; via: 'anchor' | 'link' }`
  - `QueryToolResult { question: string; hits: QueryHitOut[]; sources: string[] }`
  - `queryTool(vaultDir: string, args: { question: string; maxHits?: number }, embedder?: Embedder): Promise<QueryToolResult>`
  - `NotePayload { id: string; title: string; path: string; type: string | null; status: string | null; tags: string[]; source: string | null; body: string }`
  - `getNoteTool(vaultDir: string, args: { id?: string; path?: string }): NotePayload`
- Consumes: `runQuerySemantic` (Task 1), `loadConfig`, `scanVault`, `collectFrontmatterKeys`, `Note`, `Embedder`.

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/mcp-tools.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { queryTool, getNoteTool } from '../src/mcp/tools.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-mcp-'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, '03-Rules', 'limit.md'),
    '---\nid: RULE-LIMIT\ntype: rule\nsource: "[[FUENTE-rules]]"\n---\n# Operation limit\nThe applicable limit for an operation of type X is 5 units.');
  return dir;
}

describe('queryTool', () => {
  it('returns cited hits and a sources list (lexical when no store)', async () => {
    const dir = vault();
    const out = await queryTool(dir, { question: 'operation limit' });
    expect(out.question).toBe('operation limit');
    expect(out.hits.length).toBeGreaterThan(0);
    const top = out.hits[0];
    expect(top.id).toBe('RULE-LIMIT');
    expect(top.path).toBe('03-Rules/limit.md');
    expect(typeof top.excerpt).toBe('string');
    expect(out.sources).toContain('03-Rules/limit.md');
  });
  it('respects maxHits', async () => {
    const dir = vault();
    const out = await queryTool(dir, { question: 'operation limit', maxHits: 1 });
    expect(out.hits.length).toBeLessThanOrEqual(1);
  });
});

describe('getNoteTool', () => {
  it('returns the full note by id', () => {
    const dir = vault();
    const n = getNoteTool(dir, { id: 'RULE-LIMIT' });
    expect(n.title).toBe('Operation limit');
    expect(n.path).toBe('03-Rules/limit.md');
    expect(n.body).toContain('5 units');
    expect(n.source).toBe('FUENTE-rules');
  });
  it('returns the full note by path', () => {
    const dir = vault();
    const n = getNoteTool(dir, { path: '03-Rules/limit.md' });
    expect(n.id).toBe('RULE-LIMIT');
  });
  it('throws a clear error when the note is not found', () => {
    const dir = vault();
    expect(() => getNoteTool(dir, { id: 'NOPE' })).toThrow(/not found: NOPE/);
  });
});
```
(Note: `note.source` is stored with the `[[ ]]` brackets stripped by the engine, so the expected value is `FUENTE-rules`.)

- [ ] **Step 2: Run the test to verify it fails**

Run (from `toolkit/`): `npm test -- mcp-tools`
Expected: FAIL — cannot find module `../src/mcp/tools.js`.

- [ ] **Step 3: Implement the handlers**

Create `toolkit/src/mcp/tools.ts`:
```ts
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { runQuerySemantic } from '../commands/query.js';
import type { Embedder } from '../semantic/embedder.js';
import type { Note } from '../types.js';

export interface QueryHitOut {
  id: string;
  title: string;
  path: string;
  excerpt: string;
  source: string | null;
  score: number;
  via: 'anchor' | 'link';
}
export interface QueryToolResult {
  question: string;
  hits: QueryHitOut[];
  sources: string[];
}

export async function queryTool(
  vaultDir: string,
  args: { question: string; maxHits?: number },
  embedder?: Embedder,
): Promise<QueryToolResult> {
  const result = await runQuerySemantic(vaultDir, args.question, embedder);
  const maxHits = args.maxHits ?? 8;
  return {
    question: result.question,
    hits: result.hits.slice(0, maxHits).map(h => ({
      id: h.id,
      title: h.title,
      path: h.path,
      excerpt: h.excerpt,
      source: h.source,
      score: h.score,
      via: h.via,
    })),
    sources: result.sources,
  };
}

export interface NotePayload {
  id: string;
  title: string;
  path: string;
  type: string | null;
  status: string | null;
  tags: string[];
  source: string | null;
  body: string;
}

export function getNoteTool(vaultDir: string, args: { id?: string; path?: string }): NotePayload {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  let note: Note | undefined;
  if (args.id) note = notes.find(n => n.id === args.id);
  else if (args.path) note = notes.find(n => n.path === args.path);
  const ref = args.id ?? args.path ?? '(no id or path)';
  if (!note) throw new Error(`note not found: ${ref}`);
  return {
    id: note.id,
    title: note.title,
    path: note.path,
    type: note.type,
    status: note.status,
    tags: note.tags,
    source: note.source,
    body: note.body,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `toolkit/`): `npm test -- mcp-tools`
Expected: PASS (all five cases).
Run: `npm test` → full suite PASS. `npm run build` → clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/mcp/tools.ts toolkit/test/mcp-tools.test.ts
git commit -m "feat(toolkit): MCP tool handlers — cortex_query + cortex_get_note"
```

---

### Task 3: MCP server + `cortex mcp` command

**Files:**
- Create: `toolkit/src/mcp/server.ts`
- Create: `toolkit/src/commands/mcp.ts`
- Modify: `toolkit/src/cli.ts` (import + `case 'mcp'` + usage string)
- Test: `toolkit/test/mcp-server.test.ts`

**Interfaces:**
- Produces: `createMcpServer(vaultDir: string): McpServer` (registers the two tools, holds the warm embedder), `runMcp(vaultDir: string): Promise<void>` (connect stdio transport).
- Consumes: `queryTool`/`getNoteTool` (Task 2), `loadStore`/`storeMap` (`../semantic/store.js`), `createTransformersEmbedder`/`Embedder` (`../semantic/embedder.js`), `loadConfig`/`collectFrontmatterKeys`.

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/mcp-server.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `toolkit/`): `npm test -- mcp-server`
Expected: FAIL — cannot find module `../src/mcp/server.js`.

- [ ] **Step 3: Implement the server**

Create `toolkit/src/mcp/server.ts`:
```ts
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

  // Warm embedder, memoized for the life of the process. `undefined` = not yet
  // resolved; `null` = resolved to "no semantic" (no store / no peer / failed).
  let warm: Embedder | null | undefined;
  async function warmEmbedder(): Promise<Embedder | undefined> {
    if (warm !== undefined) return warm ?? undefined;
    const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
    const store = loadStore(resolve(vaultDir, config.embedDir));
    if (!store || store.model !== config.embedModel) { warm = null; return undefined; }
    try {
      warm = await createTransformersEmbedder(config.embedModel, resolve(vaultDir, '.cortex/models'));
    } catch {
      warm = null; // optional peer absent or model load failed → lexical
    }
    return warm ?? undefined;
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
      const result = await queryTool(vaultDir, { question, maxHits }, await warmEmbedder());
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
        return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: (e as Error).message }] };
      }
    },
  );

  return server;
}
```
(If the installed SDK rejects the `inputSchema` raw-shape object, wrap each in `z.object({...})` or use the version's documented form — see Global Constraints. The handler return shape `{ content: [{ type: 'text', text }] }` is stable across 1.x.)

- [ ] **Step 4: Run the server test to verify it passes**

Run (from `toolkit/`): `npm test -- mcp-server`
Expected: PASS.

- [ ] **Step 5: Implement the command**

Create `toolkit/src/commands/mcp.ts`:
```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from '../mcp/server.js';

export async function runMcp(vaultDir: string): Promise<void> {
  const server = createMcpServer(vaultDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The transport keeps the process alive on stdio; resolve only on disconnect.
}
```

- [ ] **Step 6: Wire the CLI**

In `toolkit/src/cli.ts`, add the import near the other command imports:
```ts
import { runMcp } from './commands/mcp.js';
```
Add a case before `case 'gaps':`:
```ts
    case 'mcp': {
      const dir = argv.slice(1).filter(a => !a.startsWith('--'))[0];
      await runMcp(dir ? (dir.startsWith('/') ? dir : `${cwd}/${dir}`) : cwd);
      return 0;
    }
```
Update the `default:` usage string to include `mcp`:
```ts
      console.log('Usage: cortex <init|status|orphans|viz|query|atomize|promote|undo|set-status|hook|pause|resume|embed|mcp|gaps|dupes|verify|moc|doc>');
```

- [ ] **Step 7: Run the full suite + typecheck**

Run (from `toolkit/`): `npm test`
Expected: PASS (no regressions).
Run: `npm run build`
Expected: `tsc` clean. (Confirms the SDK imports and types resolve.)

- [ ] **Step 8: Manual smoke (optional, requires a Claude Code client)**

Register and exercise the server against a real vault:
```bash
npm run build
claude mcp add cortex -- node "$(pwd)/dist/cli.js" mcp
# then, in that vault, ask the agent a question and confirm cited JSON results
```
Expected: the agent lists `cortex_query` / `cortex_get_note` and returns cited hits. Not part of the automated suite.

- [ ] **Step 9: Commit**

```bash
git add toolkit/src/mcp/server.ts toolkit/src/commands/mcp.ts toolkit/src/cli.ts toolkit/test/mcp-server.test.ts
git commit -m "feat(toolkit): cortex mcp — stdio MCP server with warm embedder"
```

---

### Task 4: Docs (README + CLAUDE.md)

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the README**

In `README.md`, add an "Agents (MCP)" subsection near the install/usage area. Use:
```markdown
### Use it from an AI agent (MCP)

Cortex exposes your vault to AI agents over the Model Context Protocol, so an
agent can query it as a cited knowledge source.

```bash
# in your vault directory, register the server with Claude Code:
claude mcp add cortex -- cortex mcp
```

Tools: `cortex_query` (ask a question → ranked, cited notes) and
`cortex_get_note` (fetch a full note by id/path). Semantic search is used
automatically when an embedding store exists (`cortex embed`), and the
long-running server keeps the model warm for fast queries; otherwise it falls
back to lexical search.
```

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`, add `mcp` to the `toolkit/` row's CLI command list and append:
> Exposes the vault to AI agents over MCP — `cortex mcp` runs a stdio Model Context Protocol server with two tools (`cortex_query` cited hybrid query, `cortex_get_note` full note); the long-running server keeps the embedding model warm. The read half of the agent loop; write/curate over MCP is a planned follow-up.

- [ ] **Step 3: Sanity-check**

Run (from `toolkit/`): `npm test`
Expected: PASS (docs don't affect tests).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: cortex mcp (agent-queryable knowledge source over MCP)"
```

---

## Self-Review

**Spec coverage** (spec section → task):
- §3 architecture (`src/mcp/` module, SDK as normal dep, warm embedder via `runQuerySemantic` optional param) → Task 1 (param + deps) + Task 3 (server). §4 tools + JSON shape → Task 2 (handlers) + Task 3 (registration). §5 warm model & degradation → Task 3 (`warmEmbedder`, gated on store; lexical fallback). §6 CLI & `claude mcp add` → Task 3 (cli) + Task 4 (docs). §7 dependency/packaging → Task 1. §8 testing (pure handlers + stub, server-constructs, manual smoke) → Tasks 2–3. §9 out-of-scope → not implemented (correct).

**Placeholder scan:** no TBD/TODO; every code/test step has complete content; the only "verify against installed SDK" note is an explicit, bounded adaptation instruction (the behavior is fixed), not a placeholder.

**Type consistency:** `runQuerySemantic(vaultDir, question, embedder?)`, `Embedder`, `queryTool`/`QueryToolResult`/`QueryHitOut`, `getNoteTool`/`NotePayload`, `createMcpServer`/`runMcp`, tool names `cortex_query`/`cortex_get_note` — identical across the tasks that define and consume them. `note.source` is bracket-stripped (`FUENTE-rules`) consistently in the Task 2 test and handler.
