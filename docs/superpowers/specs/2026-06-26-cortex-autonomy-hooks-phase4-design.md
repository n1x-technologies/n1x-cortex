# Cortex Phase 4 — Autonomy & hooks: detect-and-suggest lifecycle wiring — design

> **Status:** approved design, pending implementation plan.
> **Builds on:** Phases 0–3.3 — shipped on `main`. Reuses the engine (`vault`, `graph`, `query/retrieve`), the `autonomy` config field, and the `.cortex/` reversibility model.
> **Branch:** `feat/cortex-autonomy-hooks-phase4`.

## 1. Goal

Close the autonomy loop. Today every Cortex action is manual: a human runs `/atomize`, `cortex status`, `cortex promote`. Phase 4 wires the proven engine into **Claude Code lifecycle hooks** so the vault stays indexed and the agent is *reminded* to atomize — **without ever auto-writing to the graph**. The hooks bring **no new atomization logic**; they are thin, mechanical triggers around §6 of the toolkit design.

The core decision (resolved in brainstorming): a shell hook **cannot invoke Claude to AI-distill**, so the `Stop` checkpoint **detects and suggests** (`run /atomize`) rather than auto-writing mechanical drafts. The draft barrier is preserved in the strongest possible form: **autonomy never writes notes**. AI-distilled atomization stays a deliberate `/atomize` invocation.

## 2. Why detect-and-suggest (not auto-write)

The `_inbox/` draft barrier (3.1) exists so AI output never silently lands in the graph. A shell hook can only do *mechanical* segmentation (no IA), which would pollute the graph with lower-quality drafts mixed in with AI-distilled ones. So Phase 4 keeps autonomy strictly **read / track / notify**:

- `off` / `suggest` are **fully implemented**.
- `auto-draft` / `full` remain **valid config values** but behave as `suggest` for now (mechanical auto-write and auto-promote are explicitly deferred to a future phase). This honors the spec's four-level field without taking on the risk of unattended writes.

## 3. Architecture

One shared state store, one CLI entry, one plugin package. The hooks are uniform: each Claude Code lifecycle event calls the same binary with the event name; all logic lives in the CLI and is testable without Claude Code.

```
.cortex/state.json                              # shared hook state (mtime snapshot, dirty-set, pause, cost-cap)
cortex hook <event>                             # single entry: reads the event JSON on stdin, emits a hook response
cortex pause | resume                           # kill switch (also the /cortex-pause skill)
plugin/hooks.json + wrapper                     # wires the 5 lifecycle events to `cortex hook`
```

`cortex hook <event>` reads the Claude Code hook payload from **stdin** (JSON) and writes a hook response to **stdout** (JSON), per the Claude Code hook protocol. Each event maps to a pure handler over `.cortex/state.json` + the engine. No handler ever writes a note.

### 3.1 `.cortex/state.json` — the single source of hook state

```jsonc
{
  "version": 1,
  "sources": { "Markdown/a.md": 1719415200000, "Markdown/b.md": 1719415100000 },  // path → mtimeMs snapshot
  "dirty": ["Markdown/a.md"],            // sources changed since last reconcile
  "paused": false,                        // kill switch
  "session": { "id": "…", "injectedTokens": 0 }  // per-session cost-cap accounting
}
```

- **Derived & disposable** — like the index. Safe to delete; rebuilt on next `SessionStart`.
- **mtime snapshot is the dirty oracle.** `SessionStart` and `Stop` compute the dirty-set by diffing live `sourcesDir` mtimes against `sources`. `PostToolUse` (Wave 2) additionally marks dirty in real time, but the snapshot diff is authoritative, so the system is correct even if `PostToolUse` never fires.
- **Scoped** — only paths under `config.sourcesDir` are ever tracked.

## 4. The hooks

### Wave 1 — low-risk core

| Hook | Handler behavior | Writes? |
|---|---|---|
| **SessionStart** | Reconcile mtime snapshot (incremental reindex of changed `.md`); inject **one line** of vault status (`N notes · M drafts · K dirty sources · P% atomized`). Respects `paused` / `autonomy: off` (silent). | no (read) |
| **Stop** | The checkpoint: recompute the dirty-set from the snapshot; if non-empty and `autonomy ≥ suggest` and not paused, emit **one line** — `"Cortex: N source(s) changed — run /atomize to distill"`. **Never writes.** Update the snapshot so the same change isn't re-announced. | no (notify) |

Kill switch: `cortex pause` sets `paused: true`; `cortex resume` clears it; `/cortex-pause` is the skill front-end. `autonomy: off` short-circuits every handler.

### Wave 2 — optional, on the proven core

| Hook | Handler behavior | Writes? |
|---|---|---|
| **PostToolUse** | If the tool touched a path under `sourcesDir`, mark it dirty in `state.json` (debounced; a no-op if already dirty). No atomization (too frequent). | no (track) |
| **UserPromptSubmit** | If the prompt looks like a domain question (heuristic gate), retrieve top-k relevant notes via `query/retrieve` and inject them as grounding context. Quiet, capped by the per-session token budget; on exceed → inject nothing. | no (read) |
| **SessionEnd** | Final snapshot reconcile; optional **one-line** session digest (`X sources changed · Y still need atomizing`). | minimal (state only) |

## 5. Guards (all mechanical, from §8 of the toolkit design)

- **Draft barrier, absolute** — no hook writes a note. (Stronger than the spec's "draft only".)
- **Kill switch** — `autonomy: off` or `cortex pause` silences every handler.
- **Scoped** — acts only within `vaultRoot` / `sourcesDir`; paths realpath-confined.
- **Incremental & idempotent** — snapshot diff means unchanged sources are never reprocessed; re-running a hook on the same state is a no-op.
- **Debounce / batch** — detection happens at `SessionStart` / `Stop`, not per keystroke; `PostToolUse` only flips a dirty bit.
- **Quiet by default** — every hook emits at most one line; detail on demand via `cortex status`.
- **Cost cap** — `UserPromptSubmit` grounding respects a per-session token budget (`session.injectedTokens`); on exceed it injects nothing (degrades to no grounding).
- **Fail-open & silent** — any handler error (missing vault, unreadable state, malformed payload) exits 0 with no output, so a Cortex hiccup never blocks the user's Claude Code session.

## 6. Components

### 6.1 `src/hooks/state.ts` (new) — the state store
- `loadState(vaultDir)`, `saveState(vaultDir, state)` — read/write `.cortex/state.json`, tolerant of a missing/corrupt file (returns a fresh state).
- `snapshotSources(vaultDir, config)` — scan `sourcesDir`, return `path → mtimeMs`.
- `computeDirty(prevSnapshot, liveSnapshot)` — set diff (added/changed paths).
- `reconcile(state, liveSnapshot)` — fold the live snapshot into state, recompute `dirty`, return the new state.
- `markDirty(state, relPath)`, `clearDirty(state)`, `setPaused(state, bool)`.

### 6.2 `src/hooks/handlers.ts` (new) — the per-event handlers
- One pure function per event: `onSessionStart`, `onStop`, `onPostToolUse`, `onUserPromptSubmit`, `onSessionEnd`. Each takes `(payload, vaultDir, config, state)` and returns `{ state, response }` where `response` is a Claude Code hook response object (`{ systemMessage?, hookSpecificOutput?, additionalContext? }`) — never throws past the dispatcher.
- `gate(state, config)` — shared short-circuit: returns `false` (no-op) when `autonomy === 'off'` or `state.paused`.

### 6.3 `src/hooks/dispatch.ts` (new) — the stdin/stdout bridge
- `runHook(vaultDir, event, stdinJson): string` — parse payload, load state + config, call the handler, persist state, return the JSON response. Catches everything → returns `'{}'` (fail-open).

### 6.4 `src/commands/hook.ts` + `pause.ts` (new)
- `runHookCommand(vaultDir, event)` — reads stdin, calls `runHook`, writes stdout.
- `runPause` / `runResume` — flip `state.paused`, print one line.

### 6.5 `src/cli.ts` (modify)
- New cases: `hook <event>` (reads stdin), `pause`, `resume`. Usage string extended.

### 6.6 plugin packaging (new)
- `plugin/hooks.json` — maps `SessionStart`, `Stop`, `PostToolUse`, `UserPromptSubmit`, `SessionEnd` to a command that invokes the wrapper with the event name.
- `plugin/bin/cortex-hook` (wrapper) — resolves Node + `${CLAUDE_PLUGIN_ROOT}/toolkit/dist/cli.js`; if `dist/` is absent, runs `npm run build` once, then execs `cortex hook <event>`. Reliable without a global install or `tsx` per invocation.
- The existing `/atomize` skill ships alongside; `/cortex-pause` skill added.

## 7. Scope

**In:** `.cortex/state.json` state engine · `cortex hook <event>` (stdin/stdout) · the 5 lifecycle handlers (Wave 1: SessionStart, Stop; Wave 2: PostToolUse, UserPromptSubmit, SessionEnd) · `cortex pause`/`resume` + `/cortex-pause` skill · plugin packaging (`hooks.json` + wrapper) · README/CLAUDE.

**Out (later phases):** mechanical auto-write at `Stop` (the `auto-draft` write behavior) · auto-promote (`full`) · semantic grounding for `UserPromptSubmit` (v1 is FTS retrieval) · a daemon/file-watcher (hooks are the trigger, not a long-running watcher — the viewer keeps its own watch) · per-session digests beyond one line · marketplace distribution.

## 8. Testing

TDD against temp vaults, driving handlers with synthetic Claude Code payloads — **no Claude Code runtime needed** (the stdin/stdout seam is the test surface):

- **state:** snapshot reflects mtimes; `computeDirty` finds added/changed, ignores unchanged; `reconcile` updates snapshot + dirty; load tolerates missing/corrupt file; only `sourcesDir` paths tracked.
- **SessionStart:** reconciles snapshot; status line counts correct; silent when `autonomy: off` / paused.
- **Stop:** suggests when dirty + `suggest`; **writes no notes** (assert vault note count unchanged); silent when clean / paused / off; doesn't re-announce after snapshot update.
- **PostToolUse:** marks a `sourcesDir` path dirty; ignores out-of-scope paths; idempotent.
- **UserPromptSubmit:** injects grounding for a domain-like prompt; injects nothing past the cost cap; nothing for a non-domain prompt.
- **SessionEnd:** reconciles; digest line correct.
- **dispatch:** malformed stdin → `'{}'` exit 0 (fail-open); unknown event → `'{}'`.
- **pause/resume:** flips `state.paused`; gated handlers no-op while paused.
- Full suite stays green; `npm run build` clean. Manual smoke: install the plugin against the dogfood vault, edit a `Markdown/` source, end a turn, confirm the one-line `Stop` suggestion appears and **no note was written**; `cortex pause`, repeat, confirm silence.

## 9. File structure (planned)

```
toolkit/
├── src/hooks/
│   ├── state.ts                 — .cortex/state.json store + snapshot/dirty/reconcile (new)
│   ├── handlers.ts              — onSessionStart/onStop/onPostToolUse/onUserPromptSubmit/onSessionEnd (new)
│   └── dispatch.ts              — runHook stdin→handler→stdout, fail-open (new)
├── src/commands/
│   ├── hook.ts                  — runHookCommand (stdin/stdout) (new)
│   └── pause.ts                 — runPause / runResume (new)
├── src/cli.ts                   — hook / pause / resume cases (modify)
├── skills/cortex-pause/SKILL.md — kill-switch skill front-end (new, beside skills/atomize/)
└── test/
    ├── hook-state.test.ts       — (new)
    ├── hook-handlers.test.ts    — (new)
    └── hook-dispatch.test.ts    — (new)
plugin/                          — Claude Code plugin root (${CLAUDE_PLUGIN_ROOT})
├── hooks.json                   — 5 lifecycle events → wrapper (new)
└── bin/cortex-hook              — Node resolver + auto-build fallback (new)
```

> **Note on plugin layout:** the wrapper resolves `${CLAUDE_PLUGIN_ROOT}/toolkit/dist/cli.js`, so the plugin root is the repo root and `toolkit/` ships inside it. The `plugin/` folder holds only the hook wiring; final manifest layout (e.g. a root `plugin.json` co-locating `hooks/` and `skills/`) is settled in the implementation plan.

Docs: README (`What it does today` table + CLI lines + roadmap `Phase 4 ✓ (detect-and-suggest)`) and CLAUDE updated, per the README-on-every-push convention.

## 10. Build order (two waves, one phase)

1. **Wave 1** — state engine + dispatch + `SessionStart` + `Stop` + `pause`/`resume` + plugin packaging + their tests. Ships a working, low-risk autonomy core (index-on-start, suggest-on-stop, kill switch).
2. **Wave 2** — `PostToolUse` + `UserPromptSubmit` grounding + `SessionEnd`, each on the green Wave-1 core, with tests.

Each wave ends green (`vitest` + `npm run build`) before the next begins.
