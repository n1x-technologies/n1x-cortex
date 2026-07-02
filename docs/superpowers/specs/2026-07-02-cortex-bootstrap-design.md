# Cortex bootstrap — document a whole repo from zero — design

> **Status:** designed on `feat/cortex-bootstrap`. Not yet implemented.
> **Builds on:** the portable distillation feature just merged (PR #66) — `atomize/methodology.ts` (`DISTILL_METHODOLOGY`), the `emit` worksheet carrying `instructions`, the BYO-key distiller (`atomize/distill-llm.ts`, `atomize/llm-client.ts`), and the existing reversible atomize pipeline (`emit.ts`, `apply-distilled.ts` — `applyDistilledInput`, `.cortex/backups/`, `cortex undo`). No new engine write/backup logic; bootstrap is a thin pipeline over the existing seam.
> **Branch:** `feat/cortex-bootstrap`.
> **Product context:** open-source hardening item #2. Most teams adopting Cortex have an **undocumented** codebase and no markdown vault to atomize. Bootstrap makes install-time onboarding real: point Cortex at a repo and it reads every file — including **code**, not just markdown — and distills the project's concepts, modules, flows and decisions into atomic, connected notes, so the vault is a useful knowledge graph from the first run. It is the payoff of #1: because distillation is now portable (any agent, or a BYO-key CLI), bootstrap can drive it autonomously over hundreds of files. Item #3 (README rewrite / i18n) is a separate later cycle. This spec is **v1** — the live-updating graph, per-language symbol parsing, an import-graph pass, and checkpoint/resume are explicitly deferred (see §8).

## 1. Goal

`cortex bootstrap [path] --model <provider:model> [--base-url <url>] [--write]` walks a repository, and for every eligible file distills the concepts it embodies into atomic `status: draft` notes in `_inbox/`, connected by wikilinks — the same output shape as `atomize`, but sourced from the whole repo (code + existing docs) instead of one markdown file. The run streams per-file progress in the terminal and ends by pointing the user at `cortex viz`. Two drivers share one engine: an autonomous BYO-key CLI loop, and an MCP surface so an agent can drive the same walk with its own model.

Non-goals for v1: a note-per-file layer (we produce concept notes, not file summaries), a live-filling graph, symbol-level parsing, an import/dependency graph, and checkpoint/resume. All deferred to later cycles that build on this base.

## 2. Design principles

- **Reuse the seam, don't rebuild it.** Bootstrap is `discover → ingest → distill → apply`. `distill` and `apply` are the existing portable-distillation pieces, untouched. The only new mechanism is discovery (which files) and ingest (how each file becomes a worksheet). The engine still contains no AI — the distiller is the caller (a BYO-key LLM call, or an MCP agent).
- **One engine, two drivers.** Discovery + ingest + apply are shared. The CLI driver loops with `distill-llm`; the MCP driver exposes the same walk so an agent iterates it. Only *who distills* differs — the same insight as #1, where `emit` is the seam.
- **Language-agnostic and dependency-light.** No parsers, no tree-sitter grammars, no new npm dependencies. A code file is handed to the distiller as text with code-tuned instructions; the LLM reads it. This keeps every language in scope and the base install light.
- **Sources stay sacred; nothing is copied.** The repo's code is read **in place** and never copied into `Markdown/` or modified. Distilled notes cite the file by its repo-relative path. `Markdown/` remains the immutable sources dir; the repo's own files are immutable too.
- **The whole run is one reversible unit.** Every file's `apply` is journaled under a single shared `runId`, so `cortex undo` reverses the entire bootstrap in one call — not just the last file.
- **Dry-run by default; degrade, never crash.** Without `--write`, bootstrap prints the manifest and estimated counts and writes nothing. A single file that fails to distill is logged and skipped; the run continues and reports failures in the summary. A missing API key errors with the named env var (from #1). No silent no-op: `bootstrap` with neither `--model` nor an agent driver errors.

## 3. Architecture

```
cortex bootstrap ./  --model <provider:model>  [--write]
        │
        ▼
  1. DISCOVER — walk the repo → manifest [{ path, kind, bytes }]
        (respect .gitignore; skip binaries, lockfiles, node_modules/, .git/, .cortex/, oversized)
        │
        ▼
  2. INGEST — per file, build a worksheet (AtomizeEmitPlan shape):
        ├─ doc  (.md/text) → segmentSource (headings)     + DISTILL_METHODOLOGY (prose, #1)
        └─ code            → whole file / size chunks       + DISTILL_METHODOLOGY_CODE (new)
        (both carry vault context: existing, knownTypes, knownFolders)
        │
        ▼
  3. DISTILL the worksheet:
        ├─ CLI driver   → distillWorksheetWithLlm (BYO-key, #1) in a loop
        └─ agent driver → iterate the manifest over MCP, distill with its own model
        │
        ▼
  4. APPLY → applyDistilledInput (existing) → drafts to _inbox/
        (cite the file path; code never copied to Markdown/)
        one shared runId for the whole run → `cortex undo` reverses the entire bootstrap
        │
        ▼
  5. per-file terminal progress; final summary + "open cortex viz"
```

The contract between discovery and distillation is the manifest (a list of files + kinds); the contract between ingest and distillation is the existing `AtomizeEmitPlan` worksheet — bootstrap just builds that worksheet for code as well as markdown.

## 4. Components

### 4.1 New — the `bootstrap/` module

| File | Responsibility |
|---|---|
| `toolkit/src/atomize/bootstrap/discover.ts` | `discover(root, config) → BootstrapManifest` = `{ path, kind: 'doc'\|'code', bytes }[]` plus `skipped: { path, reason }[]`. Walks from `root`; respects `.gitignore`; skips `.git/`, `node_modules/`, `.cortex/`, the vault's own `sourcesDir`/`_inbox`/curated folders, binaries (null-byte sniff + extension), lockfiles/minified, and files over a size cap. Classifies by extension: a code allowlist → `code`; `.md`/`.mdx`/`.txt` → `doc`. |
| `toolkit/src/atomize/bootstrap/ingest.ts` | `buildWorksheet(vaultDir, filePath, kind, config) → AtomizeEmitPlan`. Gathers vault context via the shared helper (see §4.3) and routes by `kind`: `doc` → `segmentSource` + `DISTILL_METHODOLOGY`; `code` → whole file (or `chunkCode` output) as segment(s) + `DISTILL_METHODOLOGY_CODE`. `source` = the repo-relative file path (for citations). |
| `toolkit/src/atomize/bootstrap/chunk.ts` | `chunkCode(text, maxChars) → string[]`. One chunk for normal files; splits oversized files at line boundaries so each chunk fits the model budget, losing no lines. |
| `toolkit/src/commands/bootstrap.ts` | `runBootstrap(root, opts) → BootstrapResult`. Orchestrates `discover` → for each file `buildWorksheet` → `distillWorksheetWithLlm` (with the shared `runId`) → collect result, **continue-on-error**. Streams per-file progress and returns per-file counts + failures. `formatBootstrap(result)` renders the summary. |
| `toolkit/src/mcp/tools-bootstrap.ts` | `cortex_bootstrap_plan` (returns the manifest) and `cortex_bootstrap_emit` (returns the worksheet for one repo file). The agent iterates the plan, distills each worksheet with its own model, and writes via the existing `cortex_atomize_apply`. Registered only under a write scope (same gate as the other write tools). |

### 4.2 New — the code methodology

| File | Change |
|---|---|
| `toolkit/src/atomize/methodology.ts` | Add `DISTILL_METHODOLOGY_CODE`: tuned for a code source — "extract the concepts, responsibilities, flows and decisions this code embodies as atomic notes; do NOT restate it line-by-line or document every trivial function; cite the file; connect to `existing` notes." Reuses the core rules (atomic, phantom-wikilink prohibition, type/folder routing, mandatory citations) reframed for code. |

### 4.3 Small refactors that serve the goal (pieces we are touching)

| File | Change |
|---|---|
| `toolkit/src/atomize/emit.ts` | Extract the vault-context assembly (`scanVault → existing, knownTypes, knownFolders`) into a shared helper `gatherVaultContext(vaultDir, config)`. `emitPlan` uses it; `ingest.buildWorksheet` uses it. No duplicated logic. `emitPlan`'s output is unchanged. |
| `toolkit/src/atomize/distill-llm.ts` | Add `distillWorksheetWithLlm(vaultDir, worksheet, config, client, opts)` that distills an already-built worksheet (skips the internal `emitPlan`). `distillWithLlm` (from #1) becomes a thin wrapper: `emitPlan` → `distillWorksheetWithLlm`. Bootstrap reuses the same distiller with code worksheets. Existing #1 tests stay green. |
| `toolkit/src/atomize/backup.ts` | Ensure creations recorded under an existing `runId` **append** rather than overwrite, so many files' applies accumulate under one bootstrap `runId` and `cortex undo` reverses them all. (Verify current behavior; adjust only if it overwrites.) |
| `toolkit/src/cli.ts` | New `case 'bootstrap':` — parse `[path]` (default `.`), `--model`/`--base-url` (reuse #1's value-flag parsing + the no-value guards), `--write`. The CLI driver is BYO-key, so `--model` is required; without it → usage error, return 1 (the agent driver is the separate MCP path, not this command). |

## 5. Data flow — CLI driver

```
cortex bootstrap ./ --model anthropic:<model> [--write]
  1. manifest = discover(root, config)                              [new]
  2. runId = one shared id for the whole run                        [enables single undo]
  3. for each file in manifest (continue-on-error):
       worksheet = buildWorksheet(vaultDir, file.path, file.kind, config)         [new]
       result    = distillWorksheetWithLlm(vaultDir, worksheet, config, client,
                                            { write, force, runId })              [reuses #1 + apply]
       report(`  • ${file.path} → ${result.written.length} notes`)               [terminal stream]
  4. summary: files · notes · skipped · failed  →  "open: cortex viz"
```

Steps in `applyDistilledInput` (write, backup, slug, reversibility) are existing, untouched. New code: `discover`, `buildWorksheet`, the loop, and the reporter.

## 6. Error handling

Every failure writes nothing partial and leaves the repo untouched.

| Situation | Behavior |
|---|---|
| Empty repo / no eligible files | Clear message; does not run. |
| A file fails to distill (LLM error, non-JSON) | Logged, **run continues**; counted as failed in the summary. One bad file never aborts the run. |
| Binary / oversized / vendored file | Skipped in `discover`, reason shown in the manifest (dry-run). |
| Missing API key (CLI) | The named-env-var error from #1's `makeLlmClient`. Does not run. |
| `cortex bootstrap` (CLI) with no `--model` | Usage error, return 1 (the CLI driver is BYO-key; the agent driver is the separate MCP path). No silent no-op — matches #1. |
| No `--write` | Dry-run default: print the manifest + estimated counts, write nothing. |
| Re-running bootstrap | Safe: `applyDistilled` skips duplicates via `existing` matching; drafts land in `_inbox/`. (Checkpoint/resume to skip already-processed files is deferred to v2.) |

## 7. Testing

- **`discover.ts`:** fixture repo → manifest respects `.gitignore`, classifies `doc` vs `code`, and skips binary (null-byte), lockfiles, `node_modules/`, `.git/`, `.cortex/`, and oversized files (each skip with a reason).
- **`ingest.buildWorksheet`:** a code file → whole-file segment + `instructions === DISTILL_METHODOLOGY_CODE`; a `.md` file → heading segments + `DISTILL_METHODOLOGY`; both carry `existing`/`knownTypes`/`knownFolders` via the shared helper.
- **`methodology.ts`:** `DISTILL_METHODOLOGY_CODE` contains the code-tuned rules (extract concepts not line-by-line, cite the file, phantom-wikilink prohibition). Guards against accidental deletion.
- **`chunk.chunkCode`:** small file → one chunk; file over `maxChars` → multiple line-boundary chunks covering all content with no lost lines.
- **`distillWorksheetWithLlm`:** mocked client — a prebuilt worksheet → parsed notes → `applyDistilledInput` with the passed `runId`; `distillWithLlm` (wrapper) still passes its #1 tests unchanged.
- **`runBootstrap` (integration, mocked client, temp vault with code + a README):** multi-file run drafts to `_inbox/` for each eligible file; **continue-on-error** (one file whose "LLM" returns garbage is counted failed but the others still produce notes); **single runId** (after the run, `cortex undo` reverses ALL bootstrap creations at once); **dry-run default** writes nothing.
- **CLI (`main`):** `cortex bootstrap` parses `[path]`/`--model`/`--base-url`/`--write`; missing key → named error; no `--model` (no agent) → usage error, return 1.
- **MCP:** `cortex_bootstrap_plan` returns the manifest; `cortex_bootstrap_emit` returns the correct worksheet (doc vs code) for a repo file.
- **Manual (out-of-band, needs keys/models):** run `cortex bootstrap` on a small real repo with Anthropic and with a local Ollama; confirm the concept notes are coherent and connected, and `cortex viz` shows the project graph.

## 8. Deferred (later cycles, all build on this base)

- **Live-updating graph** — `cortex viz` filling in real time as bootstrap distills (v2; needs the viz server to watch `_inbox/` and push updates).
- **Symbol-level parsing** (Approach B) and **import/dependency graph** (Approach C) — structural precision beyond whole-file reading.
- **Checkpoint / resume** — skip already-processed files across runs; a `.cortex/bootstrap.json` manifest with `--resume`.
- **Note-per-file layer** — the file/module summary layer alongside the concept graph (the earlier "both layers" option).
