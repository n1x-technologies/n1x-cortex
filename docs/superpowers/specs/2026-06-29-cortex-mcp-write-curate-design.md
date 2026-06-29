# Cortex MCP write/curate — `cortex mcp --write` (agent as curator) — design

> **Status:** implemented on `feat/cortex-mcp-write-curate` (TDD — `test/mcp-tools-write.test.ts` + `test/mcp-server-write.test.ts`). One refinement vs. this design: `cortex_atomize_apply` journals its created drafts (`recordCreations`) so `cortex_undo` deletes them — the CLI atomize path leaves creates un-journaled, but an unattended agent write needs creates reversible too.
> **Builds on:** the shipped MCP **read** server (`src/mcp/server.ts`, `tools.ts`, `install.ts` — tools `cortex_query` + `cortex_get_note`) and the existing reversible write/curate engine (`runEmit`/`runApply` atomize, `runSetStatus`, `runPromote`, `runMerge`, `runUndo`, the `.cortex/backups/` + `.cortex/promotions/` model). No new write logic — the MCP layer is a thin, guarded surface over commands that already exist.
> **Branch:** `feat/cortex-mcp-write-curate`.
> **Product context:** This completes the living-cortex loop over MCP. The read half (agents *consume* the brain) shipped; this is the **write half** — agents *capture & curate* knowledge as they work ("agent as curator"). It is the **last ⏭️ item** on the README roadmap. Distinct from Phase 7, which writes back via **Claude Code hooks** (a `Stop` hook spawns a headless `/atomize`): that path is Claude-Code-specific and turn-triggered. This one is **universal and agent-invoked** — *any* MCP client can write back, on its own initiative, through tool calls. Networked/multi-tenant MCP (HTTP, auth) stays out of scope; Cortex stays local-first, single-user.

## 1. Goal

Let an MCP agent write into the vault — capture new knowledge by atomizing a source, advance and promote drafts, fold duplicates — **without ever being able to irreversibly corrupt the vault**. A user opts a vault into agent-writable by launching the server with a **write scope** (`cortex mcp --write[=draft|curate]`); the same long-running stdio server then registers a small set of write/curate tools alongside the read tools. Every tool is a thin handler over an existing reversible command, so the agent inherits the full safety net (dry-run default, `_inbox/` draft barrier, `.cortex/` backups, `cortex undo`, immutable `Markdown/` sources) — now reachable, and bounded, over the wire.

## 2. Design principles

- **The calling agent IS the distiller.** This is the load-bearing insight and the clean break from Phase 7. The Cortex engine contains **no AI** — atomization's intelligence lives in the `/atomize` skill (a Claude Code agent). Phase 7 reaches that intelligence by *spawning a headless Claude*. Over MCP we don't need to: **the client is already an LLM.** So `cortex_atomize_emit` hands the agent a distillation *worksheet* (segments + existing-note context), the agent distills it with its own model, and `cortex_atomize_apply` writes the agent's distilled specs as reversible drafts. The server stays a mechanical, deterministic write surface; the AI sits at the caller.
- **Reuse the engine, don't reimplement.** Handlers wrap `runApply`, `runSetStatus`, `runPromote`, `runMerge`, `runUndo` unchanged. No write path, backup, or reversibility logic is duplicated. If a write is reversible from the CLI, it's reversible over MCP — same code.
- **Write is opt-in and human-gated.** The server is **read-only by default** (today's behavior, unchanged). Write tools are registered **only** when the human starts it with `--write`. A remote agent can never enable writes or escalate its own scope — the gate lives at process launch, outside the agent's reach.
- **Every write reversible, every write logged.** No tool performs a non-backed-up mutation. MCP write runs carry an `mcp-<ts>` runId and append to an audit log (`.cortex/mcp-writes.log`), so the human has an accountability trail and a one-call escape hatch (`cortex_undo` / `cortex undo`).
- **Quarantine before curation.** `draft` scope only ever *adds* (atomize → `_inbox/`) or flips frontmatter status — it never moves a curated file. Structural moves (promote out of `_inbox/`, merge a dupe pair) require the higher `curate` scope, and even then go through the existing reversible move.
- **Sources are sacred.** `Markdown/` is never written — the engine invariant holds, and the MCP layer adds no path that could break it.
- **Degrade, never crash.** A bad tool input, a path escape, a missing note → a clean MCP error. The server process never dies on a tool call (same contract as the read tools).

## 3. Write scopes (the opt-in gate)

One flag chosen by the human at launch decides what the agent can do. Each scope is a superset of the one below.

| Launch | Tools registered | What the agent can touch |
|---|---|---|
| `cortex mcp` (default) | `cortex_query`, `cortex_get_note` | **Read only** (today). |
| `cortex mcp --write` (= `--write=draft`) | + `cortex_atomize_emit`, `cortex_atomize_apply`, `cortex_set_status`, `cortex_undo`, read diagnostics (`cortex_dupes`, `cortex_gaps`) | **Capture** — drafts into `_inbox/`, status flips. Nothing leaves `_inbox/`. |
| `cortex mcp --write=curate` | + `cortex_promote`, `cortex_merge` | **Curate** — graduate drafts out of `_inbox/`, fold duplicate pairs. Structural, still reversible. |

The scope is also expressible in the MCP registration (e.g. `claude mcp add cortex -- cortex mcp --write=curate`), so the human's choice is recorded in the client config, not negotiated per call.

## 4. Tools

All write tools mirror the CLI: **dry-run by default**, an explicit `write: true` commits. The dry-run returns the plan the agent (and the watching human) can inspect first. Read companions carry no `write` flag.

### 4.1 `cortex_atomize_emit` (read — the distillation worksheet)

```jsonc
{ "source": "string (required, vault-relative path under Markdown/)" }
// → { source, segments: [{ title, anchor, excerpt, existingMatch? }], context }
```

Reuses `runEmit` (`emitPlan`). Pure read — surfaces the source's segments and any existing notes they'd touch, so the agent can distill against the current graph (avoid dupes, prefer updates). No write, available in any write scope.

### 4.2 `cortex_atomize_apply` (write — draft scope)

```jsonc
{ "specs": "DistilledNoteSpec[] (the agent's distilled notes, same shape /atomize emits)",
  "write": "boolean (optional, default false)" }
// → DistilledApplyResult { plan, written[], updated[], skipped[], dryRun }
```

Reuses `runApply` (`applyDistilled`). New notes land as `status: draft` in `_inbox/`; matches are updated **in place**. Every created file is recorded for undo; every updated file is backed up. The agent passes specs inline rather than a file path (the CLI's `specsPath` is read from disk; the MCP handler writes the agent's `specs` to a temp file under `.cortex/` and calls `runApply`, or calls `applyDistilled` against an in-memory spec — see §8).

### 4.3 `cortex_set_status` (write — draft scope)

```jsonc
{ "path": "string (vault-relative)", "status": "string", "write": "boolean (default false)" }
```

Reuses `runSetStatus` (`setStatus`). Advances a note's lifecycle status (e.g. `draft` → `review`), backed up. The status gate is what later lets `cortex_promote` graduate it — so the agent advances confidence here, promotes there.

### 4.4 `cortex_promote` (write — curate scope)

```jsonc
{ "write": "boolean (default false)" }
// → { plan, promoted[], skipped[], dryRun }
```

Reuses `runPromote` (`planPromote`/`applyPromote`). Moves status-advanced drafts out of `_inbox/` into their curated folders, recorded in `.cortex/promotions/` (reversible — undo returns them to `_inbox/`). No-arg: it promotes everything ready, exactly like the CLI.

### 4.5 `cortex_merge` (write — curate scope)

```jsonc
{ "keep": "string (vault-relative)", "drop": "string (vault-relative)",
  "content": "string (the agent's merged note body)", "write": "boolean (default false)" }
// → MergeResult { keep, dropped, redirected[], backups[], dryRun }
```

Reuses `runMergeNotes` with **inline content** (the agent supplies the merged body directly, mirroring 4.2's emit→distill→apply: `cortex_dupes` surfaces a near-duplicate pair, the agent composes the merge, this folds it). Keeps `keep`, deletes `drop`, redirects inbound `[[links]]`, all backed up.

### 4.6 `cortex_undo` (write — any write scope)

```jsonc
{}  // → { restored[], reverted[] }
```

Reuses `runUndo` (`undoLatestRun`). Reverses the **latest** write run (backup-restore or promotion/creation rollback). The agent's self-correction primitive and the human's escape hatch. *Caveat (documented):* undo is a single LIFO stack shared across actors (CLI, hooks, MCP) — it reverses the most recent run regardless of origin. The `mcp-<ts>` runId + audit log make MCP runs identifiable; finer per-actor undo is deferred (§9).

### 4.7 Read companions (`cortex_dupes`, `cortex_gaps`)

Read-only diagnostics registered alongside the write tools because the curate loop needs them: `cortex_dupes` feeds `cortex_merge` (which pair to fold), `cortex_gaps` tells the agent what knowledge is thin enough to be worth capturing. Thin wrappers over the existing `runDupes`/`runGaps`. `verify` is deferred unless a concrete agent need appears.

## 5. Safety & guards (the hard part — bounding a remote writer)

The CLI's safety net assumes a human at the keyboard reading `--write` prompts. A remote, possibly-autonomous agent has no such pause, so the safety must be **structural, not advisory**:

1. **Opt-in scope, launch-time only.** Read-only unless the human passed `--write`; `curate` tools absent unless `--write=curate`. The agent cannot register a tool the human didn't enable. *This is the primary control* — everything else is depth behind it.
2. **Reversibility is total.** Every write goes through the existing backup/promotion machinery; nothing mutates a file without first recording how to restore it. `cortex_undo` (and CLI `cortex undo`) reverses the latest run. There is no MCP write that `undo` cannot reverse.
3. **Quarantine barrier.** `draft` scope writes are confined to *additions* (`_inbox/` drafts) and *frontmatter status flips* — no curated file is moved or deleted. Destructive-shaped moves (promote, merge) need `curate` scope.
4. **Immutable sources.** `Markdown/` is never a write target. Enforced by the engine; the MCP layer introduces no path that writes under `sourcesDir`.
5. **Path confinement.** Every path input (`path`, `keep`, `drop`, `source`) is resolved and rejected if it escapes `vaultDir` — same guard as `cortex_get_note`. Sources must resolve under `sourcesDir`; note paths under the vault.
6. **Audit log.** `.cortex/mcp-writes.log` — one append-only line per write tool call: timestamp, tool, args summary, `write`/dryRun, runId, result counts. The human's record of what the agent did while they weren't watching.
7. **Per-session write cap.** A configurable ceiling on committed writes per server session (`mcpMaxWritesPerSession`, default 100) bounds a runaway agent; dry-runs are uncounted. On cap, write tools return a clean error and keep serving reads.
8. **Dry-run default + inspectable plan.** Every write tool previews unless `write: true`. This is the inspection affordance and CLI-parity default. *Honest scope:* against a fully autonomous agent that always sends `write: true`, the dry-run adds no protection — guards 1–3 (opt-in scope + total reversibility + quarantine) are what make an unattended write safe. The dry-run matters for a supervised agent and for the human reading the log.
9. **Local-first, no network.** Unchanged — stdio, single-user, no vault content leaves the machine.

## 6. Architecture

Extend `src/mcp/`. No engine changes beyond a possible inline-content merge helper (§8).

```
src/mcp/
  server.ts        // registers read tools always; write tools when writeScope !== 'none' (modify)
  tools.ts         // existing read handlers (unchanged)
  tools-write.ts   // pure handlers: atomizeApplyTool / setStatusTool / promoteTool / mergeTool / undoTool / atomizeEmitTool / dupesTool / gapsTool  (new)
  audit.ts         // appendWriteAudit(vaultDir, entry) + runId minting (mcp-<ts>)  (new)
src/commands/mcp.ts  // runMcp(vaultDir, { writeScope }) — thread the scope (modify)
src/cli.ts           // parse --write[=draft|curate] on the mcp case (modify)
```

- **Scope plumbing.** `runMcp(vaultDir, { writeScope: 'none' | 'draft' | 'curate' })`. `createMcpServer(vaultDir, writeScope)` registers read tools, then — guarded by scope — the draft tools, then the curate tools. Same warm-embedder memoization as today (read path untouched).
- **Handlers stay thin & pure.** Each `*Tool` calls the matching `run*` command, wraps the result as the MCP `{ content: [{ type:'text', text: JSON }] }` payload, catches and returns errors as `isError`. The cap counter and audit append live in the registration closure (where side effects already belong), not in the pure command functions — preserving the testability seam.
- **runId.** A per-call `mcp-<monotonic-ts>` id flows into the audit line and (where the command accepts it) tags the backup/promotion run so MCP writes are greppable. (`Date.now()` is fine here — this is runtime, not a workflow script.)

## 7. CLI & agent setup

- `cortex mcp [vaultPath] [--write | --write=draft | --write=curate]` — default (no flag) is today's read-only server.
- Register write-enabled with Claude Code (documented in README/CLAUDE.md):
  ```bash
  claude mcp add cortex -- cortex mcp --write=curate
  ```
  `cortex mcp install` gains an optional `--write[=...]` pass-through so the one-command hookup can register a writer.

## 8. The inline-content seam (atomize_apply & merge)

Two CLI commands read agent content from a **file path** (`runApply(specsPath)`, `runMerge(contentFile)`); over MCP the content arrives **inline** in the tool args. Two clean options, decided at implementation:

- **(preferred) Add inline-aware entry points:** `applyDistilledSpecs(vaultDir, specs, config, opts)` and `runMergeNotes(...)` already takes `{ content }` — `cortex_merge` calls it directly. For apply, factor the spec-parsing so the handler can pass parsed specs without a disk round-trip.
- **(fallback) Temp-file shim:** write `specs` to `.cortex/tmp/<runId>.json`, call the existing `runApply`, delete. Zero engine change, slightly less clean.

Either way the **write/backup/undo path is the existing one** — the seam is only *how the content reaches it*.

## 9. Scope

**In:** `tools-write.ts` (8 handlers) · scope-gated registration in `server.ts` · `--write[=draft|curate]` CLI parse + `runMcp` threading · `audit.ts` (log + runId) · per-session write cap · inline-content seam for apply/merge · path confinement on all write inputs · `install --write` pass-through · README/CLAUDE updates (roadmap `✓`, the MCP loop diagram's write arrow goes solid).

**Out (later):** HTTP/SSE transport, auth, multi-tenant (Cortex stays local-first) · `cortex_moc` / `cortex_doc` generation over MCP (read-side producers; a fast-follow if agents want them) · `cortex_verify` tool · **per-actor / scoped undo** (today's LIFO stack is shared across CLI/hooks/MCP; a tagged-undo that reverses *a specific MCP run* is a follow-up) · interactive per-write human approval (would need an elicitation/MCP-sampling round-trip; the opt-in scope + reversibility + audit log are v1's substitute) · batching/transactional multi-tool writes (each tool is its own reversible run in v1).

## 10. Testing

TDD against temp vaults, **no transport, no network, no model** — the handlers are pure over the engine:

- **tools-write handlers:** `atomizeEmitTool` returns segments for a fixture source (read, no write). `atomizeApplyTool` dry-run returns a plan and writes nothing; `write:true` creates `_inbox/` drafts + records them for undo. `setStatusTool` flips status (backed up). `promoteTool` moves a ready draft only with `write:true`. `mergeTool` folds a pair with inline content, redirects links, backs up. `undoTool` reverses the latest run. Each asserts dry-run writes nothing (note count unchanged) and `write:true` is reversible (run tool → `undoTool` → vault back to start).
- **scope gating:** `createMcpServer(vault, 'none')` registers exactly the 2 read tools; `'draft'` adds emit/apply/set_status/undo/dupes/gaps and **not** promote/merge; `'curate'` adds all. A pure assertion on the registered tool names.
- **guards:** path-escape inputs (`../outside`, a `source` outside `sourcesDir`) → clean error, no write. Write cap: the (N+1)th committed write returns the cap error while reads still succeed. Audit log gets one line per write call with the right fields.
- **CLI parse:** `--write`, `--write=draft`, `--write=curate`, and absent → the right `writeScope`; an invalid value → a clear error.
- Full suite stays green; `npm run build` clean. **Manual smoke** (only step needing a real client): `claude mcp add cortex -- cortex mcp --write=curate`, ask the agent to capture a changed source and promote it, confirm drafts/promotions appear and `cortex undo` reverses them; confirm a default `cortex mcp` exposes no write tool.

## 11. Build order

1. `audit.ts` (log + runId) + tests — pure, no tools.
2. `tools-write.ts` draft handlers (emit, apply, set_status, undo, dupes, gaps) + the inline-content seam (§8) + tests.
3. `tools-write.ts` curate handlers (promote, merge) + tests.
4. Scope-gated registration in `server.ts` + write cap + `runMcp`/`cli.ts` `--write` parse + tests.
5. `install --write` pass-through + README/CLAUDE docs (roadmap `✓`, write arrow solid).

Each step ends green (`vitest` + `npm run build`) before the next.
