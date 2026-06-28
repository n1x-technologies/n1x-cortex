# Cortex Phase 7 — Autonomous background capture: the brain that captures everything — design

> **Status:** approved direction, pending implementation plan.
> **Builds on:** Phases 0–6 — shipped on `main`. Reuses the Phase 4 hook spine (`.cortex/state.json`, `cortex hook <event>`, the `gate`), the `/atomize` skill (3.1–3.3), and the `.cortex/` reversibility model (`undo`).
> **Branch:** `feat/cortex-autonomous-capture-phase7`.
> **Goal phrase (the user's words):** *"un cerebro que capta todo, por detrás, sin que yo haga trabajo extra"* — a brain that captures everything, in the background, with zero extra effort.

## 1. Goal

Close the autonomy loop that Phase 4 deliberately left open. Today `auto-draft` and `full` are valid `autonomy` values that **behave as `suggest`**: on `Stop`, Cortex prints *"run /atomize"* and waits for a human. Phase 7 makes the brain **act on its own** — when sources change, it distills them into the graph **in the background, without taking the user's turn**, and (in `full`) graduates the confident notes into their curated folders. The user keeps working; the brain captures behind them.

The Phase 4 design recorded the blocker precisely: *"a shell hook **cannot invoke Claude to AI-distill**, so the `Stop` checkpoint detects and suggests rather than auto-writing."* Phase 7 removes that blocker. The `claude` CLI is installed and supports **headless invocation** (`claude -p "<prompt>"`). So the hook no longer needs to do AI work itself — it **spawns a detached headless Claude** that runs the existing `/atomize` skill on the dirty sources. The atomization intelligence is unchanged; Phase 7 is the *trigger and its guardrails*.

This honors the spec's original four-level `autonomy` field (`off` · `suggest` · `auto-draft` · `full`) by finally giving the top two levels real behavior.

## 2. Design principle — trigger, don't reimplement

Phase 4's rule holds: **the hook brings no new atomization logic.** The `/atomize` skill (3.1–3.3) already does the whole job autonomously — emit plan → distill with AI → write drafts to `_inbox/` → optionally `set-status` + `promote` for the notes it is confident about — and every write is backed up and reversible. Phase 7 adds exactly one new capability: **a mechanical, guarded way to launch that skill in the background.** Nothing about *how* a note is distilled changes; the only new question is *when and how the launch is safe*.

What each level now does on `Stop` (dirty sources present, not paused):

| `autonomy` | Behavior on `Stop` |
|---|---|
| `off` | Silent. Every handler short-circuits (unchanged). |
| `suggest` | One-line *"run /atomize"* suggestion (unchanged Phase 4 behavior). |
| `auto-draft` | **Spawn** headless `/atomize` for the dirty sources → drafts land in `_inbox/`. **Does not promote** (stops at the draft barrier). |
| `full` | **Spawn** headless `/atomize` for the dirty sources, instructed to **also promote** the notes it is confident about into curated folders. |

The default `autonomy` in `loadConfig` is already `auto-draft` — so a fresh vault captures to `_inbox/` automatically, and the user opts into `full` (auto-promote) or down to `suggest`/`off`.

## 3. Architecture

One new module (`src/capture/`) and a single new call site in the `Stop` handler. The handler stays pure (it *decides* whether to capture and returns an intent); the **impure spawn happens in the dispatch layer**, which already owns side effects (`saveState`). This preserves the Phase 4 testability seam: handlers are tested without spawning anything.

```
.cortex/state.json      # + capture bookkeeping (lastCaptureAt, captureCount-per-session)
.cortex/capture.lock    # single-flight lock (a run is in progress)  — new
.cortex/capture.log     # append-only log of background runs (audit trail) — new
src/capture/runner.ts   # buildCaptureCommand() + spawnCapture() (detached, fail-open) — new
src/capture/guard.ts    # isChild(), shouldCapture() (cooldown, cap, lock, level) — new
```

### 3.1 Control flow (`Stop`)

```
Stop fires
  → onStop (pure): reconcile snapshot; if no dirty → done.
      autonomy === 'suggest' → return the suggestion line (Phase 4).
      autonomy ∈ {auto-draft, full} AND shouldCapture(state,config,now) →
          return intent { capture: true, mode, sources: dirty }  (no spawn here)
  → dispatch (impure): if response carries a capture intent → spawnCapture(...)
      acquire .cortex/capture.lock (single-flight; stale-lock reclaim by age)
      spawn detached:  claude -p "<capture prompt for sources, mode>"
        env: CORTEX_AUTONOMY_CHILD=1   ← anti-recursion
        cwd: vaultRoot ; stdio: ignore → .cortex/capture.log ; child.unref()
      record lastCaptureAt + bump session captureCount; clearDirty
  → returns immediately; the user's turn never blocks.
```

The spawned Claude runs *its own* Cortex session, which fires *its own* `Stop` — `CORTEX_AUTONOMY_CHILD=1` makes that nested handler no-op (see §5), so capture never recurses.

### 3.2 The capture prompt

`buildCaptureCommand(sources, mode)` produces a headless `/atomize` invocation over the dirty sources. The prompt is explicit about the autonomy mode so the skill knows where to stop:

- `auto-draft` → *"Atomize these changed sources into `_inbox/` drafts. Do not set-status or promote — leave everything as `draft` for human review."*
- `full` → *"Atomize these changed sources. For each note you are confident is complete and correct, advance its status and `promote` it; leave anything uncertain as a `draft`."*

Both end with the existing skill's reversibility contract — every write is backed up; `cortex undo` reverses the latest run. One source per run keeps each background job small and each `undo` granular; multiple dirty sources spawn sequentially-guarded runs (the lock serializes them).

## 4. The `Stop`/dispatch changes (minimal)

- `src/hooks/handlers.ts` — `onStop` gains the branch above. It returns a `HookResponse` **plus** an optional `capture` intent (a new field on `HandlerResult`, not on the wire `HookResponse`). Still a pure function; still trivially testable (assert it *requests* capture, never that it spawned).
- `src/hooks/dispatch.ts` — after `saveState`, if the result carries a `capture` intent and `!isChild()`, call `spawnCapture`. Wrapped in try/catch → fail-open (a spawn failure never changes the JSON returned to Claude Code).
- No change to `SessionStart`, `PostToolUse`, `UserPromptSubmit`, `SessionEnd`.

## 5. Guards (all mechanical — autonomy that can't run away)

- **Anti-recursion (the critical one).** `spawnCapture` sets `CORTEX_AUTONOMY_CHILD=1`. `guard.isChild()` reads it; when true, `onStop` never captures (it may still emit the suggestion line, or stay silent). A background capture session therefore cannot spawn another. Belt-and-suspenders with the existing scope guard: captures only ever write to `_inbox/` and curated folders, never to `sourcesDir`, so they don't even mark anything dirty.
- **Single-flight lock.** `.cortex/capture.lock` (holds pid + mtime). If present and fresh, skip spawning (a run is already going). Stale locks (older than a max-run age, default 15 min) are reclaimed — a crashed run never wedges autonomy forever.
- **Cooldown.** `state.lastCaptureAt`; don't spawn again within `captureCooldownMs` (default 60 s). Rapid Stop/Stop/Stop bursts collapse into one run.
- **Per-session cost cap.** `state.session.captureCount`; stop spawning after `maxCapturesPerSession` (default 20). Protects against a pathological loop of edits → captures.
- **Kill switch (unchanged).** `cortex pause` / `autonomy: off` short-circuits in `gate` *before* any capture is considered. `/cortex-pause` skill front-end still applies.
- **Fail-open & silent.** Any error in `shouldCapture`/`spawnCapture` is swallowed; the hook still returns valid JSON and the user's session is never blocked or delayed. Spawn is detached + `unref()` so Node exits immediately.
- **Draft barrier preserved.** `auto-draft` stops at `_inbox/`; only `full` promotes, and promotion is the existing reversible move (curated note never overwritten; `undo` returns it to `_inbox/`). The user's chosen "automatic + reversible" promotion is exactly this.
- **Sources never mutated.** Unchanged invariant — `Markdown/` is read-only; capture only ever creates/updates graph notes, each backed up.

## 6. Config additions

Extends `loadConfig` defaults (all optional, no `.cortex.json` change required):

```jsonc
{
  "captureCooldownMs": 60000,     // min gap between background captures
  "maxCapturesPerSession": 20,    // per-session spawn cap
  "captureMaxRunMs": 900000,      // stale-lock reclaim age (15 min)
  "claudeBin": "claude"           // headless binary; overridable for tests/portability
}
```

`autonomy` already exists (default `auto-draft`). `.gitignore` adds `.cortex/capture.lock` and `.cortex/capture.log`.

## 7. Error handling / graceful degradation

Principle (inherited): **autonomy never breaks a session.**

- **`claude` binary absent / not on PATH** → `spawnCapture` catches ENOENT, logs one line to `.cortex/capture.log`, falls back to the Phase 4 suggestion line so the user still knows sources changed. (Detected once and remembered for the session to avoid log spam.)
- **Headless run fails** (model error, network) → it's a detached process; its failure is logged to `.cortex/capture.log`, never surfaced into the parent session. Sources stay dirty (the cooldown lets the next Stop retry).
- **Lock held by a live run** → skip silently (already capturing).
- **Crashed run leaves a stale lock** → reclaimed after `captureMaxRunMs`.
- **Child session** (`CORTEX_AUTONOMY_CHILD=1`) → no capture, no recursion.

## 8. Components

### 8.1 `src/capture/guard.ts` (new)
- `isChild(env = process.env): boolean` — `env.CORTEX_AUTONOMY_CHILD === '1'`.
- `shouldCapture(state, config, now): { ok: boolean; reason?: string }` — checks level ∈ {auto-draft, full}, not child, cooldown elapsed, session cap not hit. Pure; `now` injected.
- `lockIsStale(lock, now, maxRunMs): boolean`.

### 8.2 `src/capture/runner.ts` (new)
- `buildCaptureCommand(sources: string[], mode: 'auto-draft' | 'full', config): { bin: string; args: string[] }` — pure; the headless `/atomize` prompt. Unit-tested on the produced argv (no spawn).
- `spawnCapture(vaultDir, sources, mode, config, deps?)` — acquires the lock, spawns detached with `CORTEX_AUTONOMY_CHILD=1`, redirects stdio to `.cortex/capture.log`, `unref()`s. `deps.spawn` is injectable so tests assert the command/env **without launching Claude**. Returns `{ spawned, reason }`.
- Lock helpers: `acquireLock` / `releaseLock` / `readLock`.

### 8.3 `src/hooks/handlers.ts` (modify)
- `HandlerResult` gains optional `capture?: { mode: 'auto-draft' | 'full'; sources: string[] }`.
- `onStop` returns that intent when `shouldCapture` passes; otherwise unchanged (suggest/silent).

### 8.4 `src/hooks/dispatch.ts` (modify)
- After `saveState`, if `result.capture && !isChild()` → `spawnCapture(...)` in try/catch (fail-open). Bumps `lastCaptureAt`/`captureCount` into the saved state.

### 8.5 `src/config.ts` + `src/types.ts` (modify)
- Add the four config fields above with defaults.

### 8.6 docs
- README (`What it does today` autonomy row + roadmap `Phase 7 ✓`), CLAUDE.md (toolkit row: autonomy now writes in background), per the README-on-every-push convention.

## 9. Scope

**In:** `src/capture/` (guard + runner) · the `onStop` capture branch · the dispatch spawn site · anti-recursion env guard · lock / cooldown / session-cap / stale-lock guards · config fields · `.gitignore` entries · README/CLAUDE.

**Out (later):** a long-running file-watch daemon (hooks remain the trigger; the viewer keeps its own watch) · capturing sources *outside* a Claude Code session (no session → no `Stop` → cron/`schedule` is the vehicle, a separate phase) · batching many dirty sources into one distillation call (v1 serializes per-source via the lock) · a TUI/status surface for in-flight captures (the log file is v1's audit trail) · `auto-draft`/`full` for non-atomize actions (moc/doc autogeneration).

## 10. Testing

TDD against temp vaults, **injecting the spawner** — no real `claude`, no model, no network:

- **guard:** `isChild` reads the env flag; `shouldCapture` true only for auto-draft/full + cooldown elapsed + under cap + not child; false otherwise with the right `reason`; `lockIsStale` by age.
- **runner:** `buildCaptureCommand` emits a headless `/atomize` argv naming the right sources and the mode-correct promote instruction; `spawnCapture` (with a stub `spawn`) sets `CORTEX_AUTONOMY_CHILD=1`, cwd = vault, detached, writes the lock, logs; releasing/stale-reclaiming the lock works; ENOENT path is fail-open.
- **onStop:** with autonomy `auto-draft` + dirty → returns a `capture` intent (mode auto-draft) and **writes no notes** (assert note count unchanged in-process); `full` → intent mode full; `suggest` → suggestion line, no intent; child env → no intent; paused/off → silent.
- **dispatch:** a stubbed spawner is invoked exactly once when intent present and not child; not invoked when child; a throwing spawner still yields valid JSON (fail-open). Cooldown/cap reflected in saved state.
- Full suite stays green; `npm run build` clean. **Manual smoke** (the only step needing real `claude`): set `autonomy: full` in the dogfood vault, edit a `Markdown/` source, end a turn, confirm a background run distills it into the graph and the parent turn was not blocked; `cortex pause`, repeat, confirm silence; confirm the child run did **not** spawn a grandchild.

## 11. File structure (planned)

```
toolkit/
├── src/capture/
│   ├── guard.ts        — isChild / shouldCapture / lockIsStale (new)
│   └── runner.ts       — buildCaptureCommand / spawnCapture / lock helpers (new)
├── src/hooks/
│   ├── handlers.ts     — onStop capture intent (modify)
│   └── dispatch.ts     — spawn site, fail-open (modify)
├── src/config.ts       — capture config fields (modify)
├── src/types.ts        — CortexConfig fields (modify)
└── test/
    ├── capture-guard.test.ts    — (new)
    ├── capture-runner.test.ts   — (new)
    └── hook-capture.test.ts     — onStop intent + dispatch spawn (new)
```

## 12. Build order

1. `src/capture/guard.ts` + tests (pure, no spawn) — the decision logic.
2. `src/capture/runner.ts` + tests (injected spawn) — the command + lock.
3. `onStop` intent + `dispatch` spawn site + tests — the wiring.
4. Config fields + `.gitignore` + docs.

Each step ends green (`vitest` + `npm run build`) before the next.
