# Cortex MCP server — `cortex mcp` (agent-queryable knowledge source) — design

> **Status:** approved direction, pending implementation plan.
> **Builds on:** the published engine — `runQuerySemantic` (hybrid lexical+semantic cited query), `scanVault`, `buildGraph`, the semantic layer (`semanticQueryRanking`, the embedding store), and the existing local-server pattern in `viz/server.ts`. No new engine concepts; the MCP layer reuses what exists.
> **Branch:** `feat/cortex-mcp`.
> **Product context:** This makes **Cortex** (the open-source, local engine) a first-class **knowledge source for AI agents** — the read half of the living-cortex loop. The **write/curate half** (`cortex_capture` + curation tools, "agent as curator") is the planned **next slice**. Networked/multi-tenant MCP (HTTP transport, auth) is explicitly out of scope — Cortex stays local-first.

## 1. Goal

Expose the Cortex vault to AI agents over the **Model Context Protocol** so an agent can use it as a reliable, cited knowledge source. A new `cortex mcp` command starts a **stdio MCP server** that an agent (Claude Code, etc.) launches as a subprocess and talks to over stdin/stdout. Two tools cover the agent's consume-knowledge loop:

- **`cortex_query`** — ask a question, get cited, ranked notes (hybrid lexical+semantic) as structured JSON.
- **`cortex_get_note`** — fetch a note's full content by id or path.

Because the server is a long-running process, the embedding model loads **once** and stays warm → low-latency semantic queries (the efficiency the CLI cold-start path cannot give).

## 2. Design principles

- **Reuse the engine, don't reimplement.** The tools are thin handlers over `runQuerySemantic` and a note lookup. No retrieval logic is duplicated.
- **Citations = trust.** Every `cortex_query` hit carries its `path` and `source`, so the agent knows provenance and can verify. This is what separates Cortex from an opaque RAG.
- **Warm model, local-first, private.** stdio keeps the model loaded for the session; no vault content leaves the machine; no network at query time beyond the one-time model download performed by `cortex embed`.
- **Semantic never breaks a tool.** No store, no optional peer dep, or a model-load failure → degrade to lexical and still return. A bad tool input → a clean MCP error, never a server crash.
- **Always current.** The server re-scans the vault per query so the agent sees the live state of the notes; the heavy embedding work is hash-cached in the store.
- **Transport-agnostic core.** The tool handlers are independent of stdio; if an HTTP transport is ever added, it reuses them unchanged.

## 3. Architecture

A new isolated module `src/mcp/`. The CLI gains one command.

```
src/mcp/
  server.ts     // builds the McpServer, registers the two tools, wires them to the engine
  tools.ts      // pure handlers: queryTool(vaultDir, args, embedder?) / getNoteTool(vaultDir, args)
src/commands/mcp.ts   // runMcp(vaultDir): create server + connect StdioServerTransport
```
`cli.ts` gains a `case 'mcp'`.

- **SDK:** the official `@modelcontextprotocol/sdk` (TypeScript). Pure JS, no native binaries — a normal `dependency`, loaded only by the `mcp` command. (Exact SDK API — `McpServer`, tool registration, `StdioServerTransport` — is verified against the SDK docs at implementation time; this design fixes the behavior, not the SDK call signatures.)
- **Warm embedder:** `runMcp` creates and memoizes a single `Embedder` (lazily, on first semantic query) and passes it into the query path. To thread it without duplicating `runQuerySemantic`'s composition, `runQuerySemantic` gains an **optional `embedder` parameter** that it forwards to `semanticQueryRanking`. Additive: the cold CLI path (`runQuerySemantic(vaultDir, question)`) is unchanged.

## 4. Tools

### 4.1 `cortex_query`

Reuses `runQuerySemantic` (hybrid retrieval + RRF anchors + cited hits).

```jsonc
// input schema
{ "question": "string (required)", "maxHits": "number (optional, default 8)" }

// output (structured JSON)
{
  "question": "...",
  "hits": [
    {
      "id": "IA-OPS-01-asignacion-optima-conductor-vehiculo",
      "title": "IA de asignación óptima conductor-vehículo",
      "path": "04-Tecnico/IA-OPS-01-....md",
      "excerpt": "…window of text around the match…",
      "source": "[[FUENTE-...]]",
      "score": 0.87,
      "via": "anchor"            // or "link"
    }
  ],
  "sources": ["04-Tecnico/IA-OPS-01-....md", "..."]   // the citation set
}
```

The handler maps `QueryResult` (already produced by the engine) into this shape and truncates `hits` to `maxHits`. The MCP tool result returns both a short human-readable text summary AND the structured JSON (per MCP conventions, the JSON is the machine-consumable payload).

### 4.2 `cortex_get_note`

```jsonc
// input schema — exactly one of id | path
{ "id": "string (optional)", "path": "string (optional)" }

// output
{ "id", "title", "path", "type", "status", "tags", "source", "body" }
```

Resolution: scan the vault, match by `note.id` first, else by vault-relative `note.path`. Not found → a clean MCP error (`note not found: <ref>`). Path inputs are confined to the vault (no escape) — reject paths resolving outside `vaultDir`.

## 5. Warm model & degradation

- `runMcp` holds `let embedder: Embedder | null`. On the first `cortex_query`, if the optional peer is available and a store exists, it creates the embedder once (`createTransformersEmbedder`) and caches it; subsequent queries reuse it → no per-query model load.
- If the peer dep is absent, the store is missing, or model creation throws, the embedder stays `null` and `runQuerySemantic` runs **lexical-only** (the existing degradation in `semanticQueryRanking`, which returns `[]` on any embedder failure). The tool still returns cited lexical results.
- Tool input validation is handled by the SDK's schema; handler exceptions are caught and returned as MCP tool errors so the server process never dies.

## 6. CLI & agent setup

- `cortex mcp [vaultPath]` — starts the stdio server; vault defaults to the current working directory (consistent with the other commands), or an explicit path.
- Register with Claude Code (documented in README/CLAUDE.md):
  ```bash
  claude mcp add cortex -- cortex mcp
  ```
  (or the equivalent `.mcp.json` entry: command `cortex`, args `["mcp"]`). The agent launches the subprocess in the vault directory.

## 7. Dependency & packaging

- Add `@modelcontextprotocol/sdk` to `dependencies` (it ships in the base install; it is small and dependency-light). `@xenova/transformers` stays an **optional peer** — the MCP server runs without it (lexical), and with it the queries are semantic + warm.
- No change to the publish/release setup; `cortex mcp` is just another bin subcommand.

## 8. Testing

The handlers are pure and testable with **no MCP transport and no network**:

- **`queryTool`** over a fixture vault: with an injected **stub `Embedder`**, asserts the JSON shape — `hits[]` carry `id`/`path`/`excerpt`/`source`, `sources[]` present, `maxHits` respected. With no store, asserts it still returns lexical hits (degradation).
- **`getNoteTool`**: returns the full note by id and by path; not-found yields an error; a path resolving outside the vault is rejected.
- **`runQuerySemantic` embedder param**: a focused test that passing an injected embedder produces the same ranking as the existing path (no regression to the cold path).
- **Server registration**: a light test that `createMcpServer` registers exactly `cortex_query` and `cortex_get_note`.
- The real stdio transport + SDK wiring is exercised by a **manual smoke**: `claude mcp add cortex -- cortex mcp`, then ask the agent a question and confirm cited results. Not in the automated suite.

## 9. Out of scope (deferred)

- **Write/curate tools** (`cortex_capture`, atomize-over-MCP, curation) — the next slice ("agent as curator"), built on the existing reversible safety barriers (`_inbox` drafts, `cortex undo`, immutable sources).
- **HTTP/SSE transport, auth, multi-tenant** — out of scope; Cortex stays a local-first, single-user engine.
- **MCP resources** (browsable note list / overview) and a `cortex_overview` orientation tool — a fast-follow if agents need to explore the brain's shape before querying.
- **Per-query vault-scan caching** — re-scan per query is correct and fine at current scale; add an invalidating cache only if large vaults make it necessary.
