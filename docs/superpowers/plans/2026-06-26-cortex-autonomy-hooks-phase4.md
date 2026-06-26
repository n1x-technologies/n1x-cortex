# Cortex Phase 4 — Autonomy & Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the proven Cortex engine into Claude Code lifecycle hooks that index on session start and *suggest* atomization on turn end — **never auto-writing notes**.

**Architecture:** One shared state store (`.cortex/state.json`), one CLI entry (`cortex hook <event>`) that reads the event payload on stdin and emits a JSON hook response on stdout, and a Claude Code plugin (`plugin/hooks.json` + a Node wrapper) that maps the 5 lifecycle events to that entry. Every handler is a pure function over `(payload, vaultDir, config, state)`, testable with synthetic payloads and zero Claude Code runtime. Built in two waves: Wave 1 = low-risk core (SessionStart, Stop, kill switch, packaging); Wave 2 = optional hooks (PostToolUse, UserPromptSubmit grounding, SessionEnd) on the green core.

**Tech Stack:** Node 20 / TypeScript (ESM, `.js` import specifiers), vitest, gray-matter (already in tree). No new dependencies.

## Global Constraints

- **ESM imports use `.js` specifiers** even for `.ts` files (e.g. `import { loadState } from './state.js'`) — repo convention.
- **No new runtime dependencies.** Use `node:fs`, `node:path`, `node:os` only.
- **Hooks fail open.** Any error in a handler or the dispatcher → return `'{}'` and exit 0. A Cortex fault must never block the user's Claude Code session.
- **No hook ever writes a note.** Handlers may write only `.cortex/state.json`. Tests assert vault note counts are unchanged.
- **Scoped to `config.sourcesDir`.** Only `.md` paths under `sourcesDir` are tracked as sources.
- **Quiet by default.** Each hook emits at most one line of user-facing text.
- **Gate:** when `config.autonomy === 'off'` or `state.paused === true`, every handler is a silent no-op (`response = {}`), but `SessionStart`/`Stop`/`PostToolUse`/`SessionEnd` may still update the mtime snapshot... **no** — when gated, return the state **unchanged** and `{}`. Keep gating total and simple.
- **Test vault pattern:** `mkdtempSync(join(tmpdir(), 'cortex-hook-'))`, `loadConfig(dir, [])`, matching `test/promote.test.ts`.
- Default config: `sourcesDir = 'Markdown'`, `statusLifecycle[0] = 'draft'`, `autonomy = 'auto-draft'`. Note `auto-draft`/`full` behave as `suggest` in this phase (detect-and-suggest only).

---

## WAVE 1 — low-risk core

### Task 1: Hook state store (`.cortex/state.json`)

**Files:**
- Create: `toolkit/src/hooks/state.ts`
- Test: `toolkit/test/hook-state.test.ts`

**Interfaces:**
- Consumes: `CortexConfig` from `../types.js`.
- Produces:
  - `interface HookState { version: 1; sources: Record<string, number>; dirty: string[]; paused: boolean; session: { injectedTokens: number } }`
  - `freshState(): HookState`
  - `loadState(vaultDir: string): HookState`
  - `saveState(vaultDir: string, state: HookState): void`
  - `snapshotSources(vaultDir: string, config: CortexConfig): Record<string, number>` — vault-relative `.md` path under `sourcesDir` → `mtimeMs`
  - `computeDirty(prev: Record<string, number>, live: Record<string, number>): string[]` — sorted paths that are new or whose mtime increased
  - `reconcile(state: HookState, live: Record<string, number>): HookState` — `sources = live`, `dirty = sorted union(state.dirty, computeDirty(state.sources, live))`
  - `markDirty(state: HookState, relPath: string): HookState`
  - `clearDirty(state: HookState): HookState`
  - `setPaused(state: HookState, paused: boolean): HookState`

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/hook-state.test.ts
import { describe, it, expect } from 'vitest';
import { freshState, loadState, saveState, snapshotSources, computeDirty, reconcile, markDirty, clearDirty, setPaused } from '../src/hooks/state.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-hook-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'a.md'), '# A');
  writeFileSync(join(dir, 'Markdown', 'b.md'), '# B');
  return dir;
}

describe('snapshotSources', () => {
  it('maps only sourcesDir .md files to mtimes', () => {
    const dir = vault();
    writeFileSync(join(dir, 'top.md'), '# not a source');  // outside Markdown/
    const snap = snapshotSources(dir, loadConfig(dir, []));
    expect(Object.keys(snap).sort()).toEqual(['Markdown/a.md', 'Markdown/b.md']);
  });
});

describe('computeDirty', () => {
  it('flags new and increased-mtime paths only', () => {
    const prev = { 'Markdown/a.md': 100, 'Markdown/b.md': 100 };
    const live = { 'Markdown/a.md': 100, 'Markdown/b.md': 200, 'Markdown/c.md': 50 };
    expect(computeDirty(prev, live)).toEqual(['Markdown/b.md', 'Markdown/c.md']);
  });
});

describe('reconcile', () => {
  it('updates snapshot and accumulates dirty union', () => {
    const s = { ...freshState(), sources: { 'Markdown/a.md': 100 }, dirty: ['Markdown/x.md'] };
    const next = reconcile(s, { 'Markdown/a.md': 300 });
    expect(next.sources).toEqual({ 'Markdown/a.md': 300 });
    expect(next.dirty).toEqual(['Markdown/a.md', 'Markdown/x.md']);
  });
});

describe('load/save + mutators', () => {
  it('round-trips, tolerates missing/corrupt, and mutates immutably', () => {
    const dir = vault();
    expect(loadState(dir)).toEqual(freshState());           // missing → fresh
    saveState(dir, { ...freshState(), paused: true });
    expect(loadState(dir).paused).toBe(true);               // round-trip
    writeFileSync(join(dir, '.cortex', 'state.json'), 'not json');
    expect(loadState(dir)).toEqual(freshState());           // corrupt → fresh
    expect(markDirty(freshState(), 'Markdown/a.md').dirty).toEqual(['Markdown/a.md']);
    expect(clearDirty({ ...freshState(), dirty: ['x'] }).dirty).toEqual([]);
    expect(setPaused(freshState(), true).paused).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/hook-state.test.ts`
Expected: FAIL — cannot find module `../src/hooks/state.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/hooks/state.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { CortexConfig } from '../types.js';

export interface HookState {
  version: 1;
  sources: Record<string, number>;   // vault-relative .md path → mtimeMs
  dirty: string[];                    // sources changed since last clear
  paused: boolean;
  session: { injectedTokens: number };
}

export function freshState(): HookState {
  return { version: 1, sources: {}, dirty: [], paused: false, session: { injectedTokens: 0 } };
}

function statePath(vaultDir: string): string {
  return join(vaultDir, '.cortex', 'state.json');
}

export function loadState(vaultDir: string): HookState {
  const p = statePath(vaultDir);
  if (!existsSync(p)) return freshState();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    if (!raw || raw.version !== 1) return freshState();
    return { ...freshState(), ...raw, session: { ...freshState().session, ...(raw.session ?? {}) } };
  } catch {
    return freshState();
  }
}

export function saveState(vaultDir: string, state: HookState): void {
  const dir = join(vaultDir, '.cortex');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(vaultDir), JSON.stringify(state, null, 2));
}

export function snapshotSources(vaultDir: string, config: CortexConfig): Record<string, number> {
  const root = join(vaultDir, config.sourcesDir);
  const out: Record<string, number> = {};
  if (!existsSync(root)) return out;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        out[relative(vaultDir, full).split(sep).join('/')] = statSync(full).mtimeMs;
      }
    }
  };
  walk(root);
  return out;
}

export function computeDirty(prev: Record<string, number>, live: Record<string, number>): string[] {
  const dirty: string[] = [];
  for (const [path, mtime] of Object.entries(live)) {
    if (prev[path] === undefined || prev[path] < mtime) dirty.push(path);
  }
  return dirty.sort();
}

export function reconcile(state: HookState, live: Record<string, number>): HookState {
  const newly = computeDirty(state.sources, live);
  const dirty = Array.from(new Set([...state.dirty, ...newly])).sort();
  return { ...state, sources: live, dirty };
}

export function markDirty(state: HookState, relPath: string): HookState {
  if (state.dirty.includes(relPath)) return state;
  return { ...state, dirty: [...state.dirty, relPath].sort() };
}

export function clearDirty(state: HookState): HookState {
  return { ...state, dirty: [] };
}

export function setPaused(state: HookState, paused: boolean): HookState {
  return { ...state, paused };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/hook-state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/hooks/state.ts toolkit/test/hook-state.test.ts
git commit -m "feat(toolkit): hook state store (.cortex/state.json snapshot + dirty)"
```

---

### Task 2: Wave-1 handlers (gate, SessionStart, Stop)

**Files:**
- Create: `toolkit/src/hooks/handlers.ts`
- Test: `toolkit/test/hook-handlers.test.ts`

**Interfaces:**
- Consumes: everything from `./state.js`; `loadConfig` is **not** used here (config is passed in); `scanVault`, `collectFrontmatterKeys` from `../vault.js`; `CortexConfig` from `../types.js`.
- Produces:
  - `interface HookResponse { systemMessage?: string; hookSpecificOutput?: { hookEventName: string; additionalContext?: string } }`
  - `interface HandlerResult { state: HookState; response: HookResponse }`
  - `type HookPayload = Record<string, unknown>`
  - `type Handler = (payload: HookPayload, vaultDir: string, config: CortexConfig, state: HookState) => HandlerResult`
  - `gate(state: HookState, config: CortexConfig): boolean` — `false` when `autonomy==='off'` or `paused`
  - `onSessionStart: Handler`, `onStop: Handler`

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/hook-handlers.test.ts
import { describe, it, expect } from 'vitest';
import { onSessionStart, onStop } from '../src/hooks/handlers.js';
import { freshState } from '../src/hooks/state.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-hh-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'a.md'), '# Source A');
  mkdirSync(join(dir, '01-Notes'));
  writeFileSync(join(dir, '01-Notes', 'n.md'), '---\nstatus: "draft"\n---\n# A note');
  return dir;
}

describe('onSessionStart', () => {
  it('injects a one-line status and snapshots sources', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const { state, response } = onSessionStart({}, dir, cfg, freshState());
    expect(state.sources['Markdown/a.md']).toBeGreaterThan(0);
    expect(response.hookSpecificOutput?.additionalContext).toMatch(/Cortex: 1 notes/);
  });
  it('is a silent no-op when paused', () => {
    const dir = vault();
    const r = onSessionStart({}, dir, loadConfig(dir, []), { ...freshState(), paused: true });
    expect(r.response).toEqual({});
  });
});

describe('onStop', () => {
  it('suggests /atomize when a source changed, and writes no notes', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const before = readdirSync(join(dir, '01-Notes')).length;
    // snapshot is empty in freshState → the existing source counts as dirty
    const { state, response } = onStop({}, dir, cfg, freshState());
    expect(response.systemMessage).toMatch(/run \/atomize/);
    expect(state.dirty).toEqual([]);                                  // cleared after announcing
    expect(readdirSync(join(dir, '01-Notes')).length).toBe(before);   // no note written
  });
  it('is silent when nothing changed', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const seeded = onStop({}, dir, cfg, freshState()).state;          // announce + clear
    const { response } = onStop({}, dir, cfg, seeded);                // snapshot now current
    expect(response).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/hook-handlers.test.ts`
Expected: FAIL — cannot find module `../src/hooks/handlers.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/hooks/handlers.ts
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { snapshotSources, reconcile, clearDirty, type HookState } from './state.js';
import type { CortexConfig } from '../types.js';

export interface HookResponse {
  systemMessage?: string;
  hookSpecificOutput?: { hookEventName: string; additionalContext?: string };
}
export interface HandlerResult { state: HookState; response: HookResponse; }
export type HookPayload = Record<string, unknown>;
export type Handler = (payload: HookPayload, vaultDir: string, config: CortexConfig, state: HookState) => HandlerResult;

export function gate(state: HookState, config: CortexConfig): boolean {
  return !(config.autonomy === 'off' || state.paused);
}

export const onSessionStart: Handler = (_payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const next = reconcile(state, snapshotSources(vaultDir, config));
  const notes = scanVault(vaultDir, config);
  const draft = config.statusLifecycle[0];
  const drafts = notes.filter(n => n.status === draft).length;
  const line = `Cortex: ${notes.length} notes · ${drafts} drafts · ${next.dirty.length} source(s) changed`;
  return { state: next, response: { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: line } } };
};

export const onStop: Handler = (_payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const reconciled = reconcile(state, snapshotSources(vaultDir, config));
  if (reconciled.dirty.length === 0) return { state: reconciled, response: {} };
  const line = `Cortex: ${reconciled.dirty.length} source(s) changed — run /atomize to distill`;
  return { state: clearDirty(reconciled), response: { systemMessage: line } };
};
```

> Note: `collectFrontmatterKeys` import is reserved for Wave-2 grounding; if your linter flags it unused here, drop it from this file and re-add in Task 7/8.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/hook-handlers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/hooks/handlers.ts toolkit/test/hook-handlers.test.ts
git commit -m "feat(toolkit): Wave-1 hook handlers (SessionStart status, Stop suggest)"
```

---

### Task 3: Dispatcher (stdin → handler → stdout, fail-open)

**Files:**
- Create: `toolkit/src/hooks/dispatch.ts`
- Test: `toolkit/test/hook-dispatch.test.ts`

**Interfaces:**
- Consumes: `onSessionStart`, `onStop` from `./handlers.js`; `loadState`, `saveState` from `./state.js`; `loadConfig` from `../config.js`; `collectFrontmatterKeys` from `../vault.js`.
- Produces: `runHook(vaultDir: string, event: string, stdinJson: string): string` — returns the JSON response string; persists state; never throws.
- A module-level `HANDLERS: Record<string, Handler>` registry; Wave 2 adds three more entries here.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/hook-dispatch.test.ts
import { describe, it, expect } from 'vitest';
import { runHook } from '../src/hooks/dispatch.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-disp-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'a.md'), '# A');
  return dir;
}

describe('runHook', () => {
  it('returns a JSON response for a known event', () => {
    const out = runHook(vault(), 'SessionStart', '{}');
    expect(JSON.parse(out).hookSpecificOutput.hookEventName).toBe('SessionStart');
  });
  it('fails open: malformed stdin → "{}"', () => {
    expect(runHook(vault(), 'SessionStart', 'not json')).toBe('{}');
  });
  it('unknown event → "{}"', () => {
    expect(runHook(vault(), 'Nope', '{}')).toBe('{}');
  });
});
```

> The malformed-stdin case returns `'{}'` because a bad payload is caught; `SessionStart` with an empty `{}` payload still succeeds (payload is ignored by the handler), so the assertion relies on the JSON.parse guard returning `{}` payload — which the handler accepts and would return a full response. To make this test meaningful, the dispatcher treats a **parse failure** as fail-open `'{}'`. See Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/hook-dispatch.test.ts`
Expected: FAIL — cannot find module `../src/hooks/dispatch.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/hooks/dispatch.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { loadState, saveState } from './state.js';
import { onSessionStart, onStop, type Handler } from './handlers.js';

const HANDLERS: Record<string, Handler> = {
  SessionStart: onSessionStart,
  Stop: onStop,
};

export function runHook(vaultDir: string, event: string, stdinJson: string): string {
  try {
    const handler = HANDLERS[event];
    if (!handler) return '{}';
    const trimmed = stdinJson.trim();
    let payload: Record<string, unknown> = {};
    if (trimmed) {
      try { payload = JSON.parse(trimmed); } catch { return '{}'; }
    }
    const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
    const state = loadState(vaultDir);
    const { state: next, response } = handler(payload, vaultDir, config, state);
    saveState(vaultDir, next);
    return JSON.stringify(response ?? {});
  } catch {
    return '{}';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/hook-dispatch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/hooks/dispatch.ts toolkit/test/hook-dispatch.test.ts
git commit -m "feat(toolkit): hook dispatcher (stdin→handler→stdout, fail-open)"
```

---

### Task 4: CLI wiring — `hook`, `pause`, `resume`

**Files:**
- Create: `toolkit/src/commands/hook.ts`
- Create: `toolkit/src/commands/pause.ts`
- Modify: `toolkit/src/cli.ts` (imports + three new cases + usage string)
- Test: `toolkit/test/hook-cli.test.ts`

**Interfaces:**
- Consumes: `runHook` from `../hooks/dispatch.js`; `loadState`, `saveState`, `setPaused` from `../hooks/state.js`.
- Produces:
  - `runHookCommand(vaultDir: string, event: string): Promise<string>` — reads `process.stdin`, calls `runHook`, returns the response string.
  - `runPause(vaultDir: string): void`, `runResume(vaultDir: string): void`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/hook-cli.test.ts
import { describe, it, expect } from 'vitest';
import { runPause, runResume } from '../src/commands/pause.js';
import { loadState } from '../src/hooks/state.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('pause/resume', () => {
  it('flips the paused flag in state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-pause-'));
    runPause(dir);
    expect(loadState(dir).paused).toBe(true);
    runResume(dir);
    expect(loadState(dir).paused).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/hook-cli.test.ts`
Expected: FAIL — cannot find module `../src/commands/pause.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/commands/pause.ts
import { loadState, saveState, setPaused } from '../hooks/state.js';

export function runPause(vaultDir: string): void {
  saveState(vaultDir, setPaused(loadState(vaultDir), true));
}
export function runResume(vaultDir: string): void {
  saveState(vaultDir, setPaused(loadState(vaultDir), false));
}
```

```ts
// toolkit/src/commands/hook.ts
import { runHook } from '../hooks/dispatch.js';

function readStdin(): Promise<string> {
  return new Promise(resolve => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

export async function runHookCommand(vaultDir: string, event: string): Promise<string> {
  const stdin = await readStdin();
  return runHook(vaultDir, event, stdin);
}
```

Then modify `toolkit/src/cli.ts`. Add imports after the existing command imports:

```ts
import { runHookCommand } from './commands/hook.js';
import { runPause, runResume } from './commands/pause.js';
```

Add three cases before the `default:` case:

```ts
    case 'hook': {
      const event = argv[1];
      if (!event) { console.log('Usage: cortex hook <event>'); return 1; }
      const out = await runHookCommand(cwd, event);
      if (out && out !== '{}') process.stdout.write(out);
      return 0;
    }
    case 'pause': {
      runPause(cwd);
      console.log('Cortex autonomy paused. Run `cortex resume` to re-enable.');
      return 0;
    }
    case 'resume': {
      runResume(cwd);
      console.log('Cortex autonomy resumed.');
      return 0;
    }
```

Update the usage string in `default:`:

```ts
      console.log('Usage: cortex <init|status|orphans|viz|query|atomize|promote|undo|set-status|hook|pause|resume>');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/hook-cli.test.ts && npx tsc --noEmit`
Expected: PASS (1 test) and a clean typecheck (confirms the cli.ts edits compile).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/commands/hook.ts toolkit/src/commands/pause.ts toolkit/src/cli.ts toolkit/test/hook-cli.test.ts
git commit -m "feat(toolkit): cortex hook/pause/resume CLI commands"
```

---

### Task 5: Plugin packaging (`hooks.json` + Node wrapper)

**Files:**
- Create: `plugin/hooks.json`
- Create: `plugin/bin/cortex-hook` (executable bash wrapper)

**Interfaces:**
- Consumes: the built CLI at `${CLAUDE_PLUGIN_ROOT}/toolkit/dist/cli.js` (from `npm run build`).
- Produces: a plugin hook config Claude Code can load; Wave 2 adds three more event entries to `hooks.json`.

- [ ] **Step 1: Create the wrapper**

```bash
# plugin/bin/cortex-hook
#!/usr/bin/env bash
# Resolve and invoke the Cortex CLI hook entry. Fail-open: never block the session.
set -uo pipefail
EVENT="${1:-}"
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CLI="$ROOT/toolkit/dist/cli.js"
if [ ! -f "$CLI" ]; then
  ( cd "$ROOT/toolkit" && npm run build >/dev/null 2>&1 ) || exit 0
fi
node "$CLI" hook "$EVENT" || exit 0
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x plugin/bin/cortex-hook`
Expected: no output; `test -x plugin/bin/cortex-hook && echo ok` prints `ok`.

- [ ] **Step 3: Create the hook config (Wave-1 events only)**

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/plugin/bin/cortex-hook SessionStart" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/plugin/bin/cortex-hook Stop" }] }
    ]
  }
}
```

- [ ] **Step 4: Verify end-to-end against a built CLI and a temp vault**

```bash
cd toolkit && npm run build && cd ..
TMP=$(mktemp -d) && mkdir -p "$TMP/Markdown" && echo "# A" > "$TMP/Markdown/a.md"
( cd "$TMP" && echo '{}' | node "$PWD/../$(basename "$PWD")/toolkit/dist/cli.js" hook Stop ) 2>/dev/null || true
# Simpler, robust check from repo root:
( cd "$TMP" && echo '{}' | node "$OLDPWD/toolkit/dist/cli.js" hook Stop )
```
Expected: prints a JSON object containing `run /atomize` in `systemMessage`. (If your shell lacks `$OLDPWD`, substitute the absolute repo path to `toolkit/dist/cli.js`.)

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks.json plugin/bin/cortex-hook
git commit -m "feat(toolkit): Claude Code plugin packaging (hooks.json + wrapper)"
```

---

### Task 6: Kill-switch skill + docs (Wave-1 close)

**Files:**
- Create: `toolkit/skills/cortex-pause/SKILL.md`
- Modify: `README.md` (toolkit table + CLI lines + roadmap)
- Modify: `CLAUDE.md` (file inventory line for `toolkit/`)

**Interfaces:**
- Consumes: the `cortex pause` / `cortex resume` commands from Task 4.
- Produces: a user-invocable `/cortex-pause` skill; updated docs.

- [ ] **Step 1: Write the skill**

```markdown
<!-- toolkit/skills/cortex-pause/SKILL.md -->
---
name: cortex-pause
description: Pause or resume Cortex autonomy (the lifecycle hooks). Use when the user wants Cortex to stop reacting to sessions/edits, or to re-enable it.
---

# Cortex pause / resume — autonomy kill switch

Cortex's lifecycle hooks (SessionStart status, Stop "run /atomize" suggestion, and any
Wave-2 hooks) are gated by a single flag in `.cortex/state.json`.

- To **pause** (hooks become silent no-ops): run `cortex pause` from the vault root.
- To **resume**: run `cortex resume`.

`cortex pause` is equivalent to setting `"autonomy": "off"` in `.cortex.json`, but is
session-local and reversible without editing config. No note is ever written by a hook
regardless of this flag — pausing only silences the read/notify behavior.
```

- [ ] **Step 2: Update README**

In `README.md`, find the toolkit "What it does today" section and add a row/line documenting the hooks (mirror the existing phrasing style). Add the three CLI verbs to the engine CLI line, e.g.:

```
init · status · orphans · viz · query · atomize · promote · undo · set-status · hook · pause · resume
```

And add a roadmap entry: `Phase 4 ✓ — Autonomy hooks (detect-and-suggest): SessionStart status, Stop /atomize suggestion, kill switch; auto-write deferred.`

- [ ] **Step 3: Update CLAUDE.md**

In the `toolkit/` row of the File inventory table, append to the CLI list `· hook · pause · resume` and add a clause: `Phase 4 adds Claude Code lifecycle hooks (SessionStart reindex+status, Stop /atomize suggestion) that never auto-write — autonomy is detect-and-suggest, gated by `cortex pause`/`autonomy: off`.` Update the phase range to `Phases 0–4`.

- [ ] **Step 4: Run the full suite + build**

Run: `cd toolkit && npx vitest run && npm run build`
Expected: all tests PASS; build clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/skills/cortex-pause/SKILL.md README.md CLAUDE.md
git commit -m "docs(toolkit): /cortex-pause skill + README/CLAUDE Phase 4 (Wave 1)"
```

---

## WAVE 2 — optional hooks on the green core

### Task 7: PostToolUse handler (real-time dirty marking)

**Files:**
- Modify: `toolkit/src/hooks/handlers.ts` (add `onPostToolUse` + a path helper)
- Modify: `toolkit/src/hooks/dispatch.ts` (register `PostToolUse`)
- Test: `toolkit/test/hook-handlers.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `markDirty` from `./state.js`; `relative`, `sep` from `node:path`.
- Produces: `onPostToolUse: Handler`; helper `sourceRelPath(payload, vaultDir, config): string | null` — extracts a file path from a PostToolUse payload and returns its vault-relative form **iff** it is a `.md` under `sourcesDir`, else `null`.

- [ ] **Step 1: Write the failing test**

```ts
// append to toolkit/test/hook-handlers.test.ts
import { onPostToolUse } from '../src/hooks/handlers.js';

describe('onPostToolUse', () => {
  it('marks a sourcesDir .md path dirty', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const payload = { tool_input: { file_path: join(dir, 'Markdown', 'a.md') } };
    const { state } = onPostToolUse(payload, dir, cfg, freshState());
    expect(state.dirty).toEqual(['Markdown/a.md']);
  });
  it('ignores paths outside sourcesDir', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const payload = { tool_input: { file_path: join(dir, '01-Notes', 'n.md') } };
    const { state } = onPostToolUse(payload, dir, cfg, freshState());
    expect(state.dirty).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/hook-handlers.test.ts`
Expected: FAIL — `onPostToolUse` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `toolkit/src/hooks/handlers.ts` (imports: extend the `node:path` import and the `./state.js` import):

```ts
import { relative, sep } from 'node:path';
import { markDirty } from './state.js';  // add markDirty to the existing state import

function sourceRelPath(payload: HookPayload, vaultDir: string, config: CortexConfig): string | null {
  const ti = (payload.tool_input ?? {}) as Record<string, unknown>;
  const raw = ti.file_path ?? ti.path ?? ti.notebook_path;
  if (typeof raw !== 'string' || !raw.endsWith('.md')) return null;
  const rel = relative(vaultDir, raw).split(sep).join('/');
  if (rel.startsWith('..')) return null;                       // outside vault
  const prefix = config.sourcesDir.endsWith('/') ? config.sourcesDir : config.sourcesDir + '/';
  return rel.startsWith(prefix) ? rel : null;                  // only under sourcesDir
}

export const onPostToolUse: Handler = (payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const rel = sourceRelPath(payload, vaultDir, config);
  return { state: rel ? markDirty(state, rel) : state, response: {} };
};
```

Register it in `toolkit/src/hooks/dispatch.ts`:

```ts
import { onSessionStart, onStop, onPostToolUse, type Handler } from './handlers.js';
// ...
const HANDLERS: Record<string, Handler> = {
  SessionStart: onSessionStart,
  Stop: onStop,
  PostToolUse: onPostToolUse,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/hook-handlers.test.ts`
Expected: PASS (all handler tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/hooks/handlers.ts toolkit/src/hooks/dispatch.ts toolkit/test/hook-handlers.test.ts
git commit -m "feat(toolkit): PostToolUse hook marks sources dirty in real time"
```

---

### Task 8: UserPromptSubmit grounding handler

**Files:**
- Modify: `toolkit/src/hooks/handlers.ts` (add `looksLikeDomainQuestion`, `onUserPromptSubmit`)
- Modify: `toolkit/src/hooks/dispatch.ts` (register `UserPromptSubmit`)
- Test: `toolkit/test/hook-handlers.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `runQuery`, `formatQuery` from `../commands/query.js`; the existing `CortexConfig`.
- Produces:
  - `looksLikeDomainQuestion(prompt: string): boolean`
  - `onUserPromptSubmit: Handler` — injects grounding as `hookSpecificOutput.additionalContext`; respects a token cap `GROUNDING_TOKEN_CAP = 4000` accumulated in `state.session.injectedTokens`.

- [ ] **Step 1: Write the failing test**

```ts
// append to toolkit/test/hook-handlers.test.ts
import { onUserPromptSubmit, looksLikeDomainQuestion } from '../src/hooks/handlers.js';

describe('onUserPromptSubmit', () => {
  it('detects domain-like questions', () => {
    expect(looksLikeDomainQuestion('What is the refund rule?')).toBe(true);
    expect(looksLikeDomainQuestion('ok thanks')).toBe(false);
  });
  it('injects grounding for a question and nothing for chatter', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const q = onUserPromptSubmit({ prompt: 'What does note n say?' }, dir, cfg, freshState());
    expect(q.response.hookSpecificOutput?.additionalContext).toBeTypeOf('string');
    expect(q.state.session.injectedTokens).toBeGreaterThan(0);
    const chat = onUserPromptSubmit({ prompt: 'ok' }, dir, cfg, freshState());
    expect(chat.response).toEqual({});
  });
  it('injects nothing once the token cap is exceeded', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const capped = { ...freshState(), session: { injectedTokens: 99999 } };
    const r = onUserPromptSubmit({ prompt: 'What is X?' }, dir, cfg, capped);
    expect(r.response).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/hook-handlers.test.ts`
Expected: FAIL — `onUserPromptSubmit` / `looksLikeDomainQuestion` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `toolkit/src/hooks/handlers.ts`:

```ts
import { runQuery, formatQuery } from '../commands/query.js';

const GROUNDING_TOKEN_CAP = 4000;
const QUESTION_WORDS = /^(what|why|how|where|when|who|which|qué|por qué|cómo|dónde|cuándo|quién|cuál)\b/i;

export function looksLikeDomainQuestion(prompt: string): boolean {
  const p = prompt.trim();
  if (p.length < 8) return false;
  return p.endsWith('?') || QUESTION_WORDS.test(p);
}

export const onUserPromptSubmit: Handler = (payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  if (!looksLikeDomainQuestion(prompt)) return { state, response: {} };
  if (state.session.injectedTokens >= GROUNDING_TOKEN_CAP) return { state, response: {} };

  const grounding = formatQuery(runQuery(vaultDir, prompt));
  if (!grounding.trim()) return { state, response: {} };
  const estTokens = Math.ceil(grounding.length / 4);
  const next: HookState = { ...state, session: { injectedTokens: state.session.injectedTokens + estTokens } };
  return {
    state: next,
    response: { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: grounding } },
  };
};
```

Register it in `toolkit/src/hooks/dispatch.ts` (add to imports and `HANDLERS`):

```ts
import { onSessionStart, onStop, onPostToolUse, onUserPromptSubmit, type Handler } from './handlers.js';
// ...
  UserPromptSubmit: onUserPromptSubmit,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/hook-handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/hooks/handlers.ts toolkit/src/hooks/dispatch.ts toolkit/test/hook-handlers.test.ts
git commit -m "feat(toolkit): UserPromptSubmit grounding (FTS retrieval, token-capped)"
```

---

### Task 9: SessionEnd handler

**Files:**
- Modify: `toolkit/src/hooks/handlers.ts` (add `onSessionEnd`)
- Modify: `toolkit/src/hooks/dispatch.ts` (register `SessionEnd`)
- Test: `toolkit/test/hook-handlers.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `snapshotSources`, `reconcile` (already imported).
- Produces: `onSessionEnd: Handler` — reconciles the snapshot, resets `session.injectedTokens` to 0, and returns a one-line digest in `systemMessage` (empty response when clean).

- [ ] **Step 1: Write the failing test**

```ts
// append to toolkit/test/hook-handlers.test.ts
import { onSessionEnd } from '../src/hooks/handlers.js';

describe('onSessionEnd', () => {
  it('digests outstanding dirty sources and resets the token budget', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const seeded = { ...freshState(), session: { injectedTokens: 1234 } };  // empty snapshot → a.md is dirty
    const { state, response } = onSessionEnd({}, dir, cfg, seeded);
    expect(response.systemMessage).toMatch(/still need atomizing/);
    expect(state.session.injectedTokens).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/hook-handlers.test.ts`
Expected: FAIL — `onSessionEnd` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `toolkit/src/hooks/handlers.ts`:

```ts
export const onSessionEnd: Handler = (_payload, vaultDir, config, state) => {
  if (!gate(state, config)) return { state, response: {} };
  const reconciled = reconcile(state, snapshotSources(vaultDir, config));
  const next: HookState = { ...reconciled, session: { injectedTokens: 0 } };
  if (reconciled.dirty.length === 0) return { state: next, response: {} };
  return {
    state: next,
    response: { systemMessage: `Cortex: ${reconciled.dirty.length} source(s) still need atomizing` },
  };
};
```

Register it in `toolkit/src/hooks/dispatch.ts`:

```ts
import { onSessionStart, onStop, onPostToolUse, onUserPromptSubmit, onSessionEnd, type Handler } from './handlers.js';
// ...
  SessionEnd: onSessionEnd,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/hook-handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/hooks/handlers.ts toolkit/src/hooks/dispatch.ts toolkit/test/hook-handlers.test.ts
git commit -m "feat(toolkit): SessionEnd hook (digest + token-budget reset)"
```

---

### Task 10: Register Wave-2 events in `hooks.json` + final docs

**Files:**
- Modify: `plugin/hooks.json` (add `PostToolUse`, `UserPromptSubmit`, `SessionEnd`)
- Modify: `README.md` (roadmap line → all 5 hooks)
- Modify: `docs/superpowers/specs/2026-06-26-cortex-autonomy-hooks-phase4-design.md` (Status → implemented)

**Interfaces:**
- Consumes: the registered handlers from Tasks 7–9.
- Produces: complete 5-event plugin wiring.

- [ ] **Step 1: Extend `plugin/hooks.json`**

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/plugin/bin/cortex-hook SessionStart" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/plugin/bin/cortex-hook Stop" }] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit|MultiEdit|NotebookEdit", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/plugin/bin/cortex-hook PostToolUse" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/plugin/bin/cortex-hook UserPromptSubmit" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/plugin/bin/cortex-hook SessionEnd" }] }
    ]
  }
}
```

- [ ] **Step 2: Update README roadmap + spec status**

In `README.md`, update the Phase 4 roadmap line to list all five hooks (SessionStart · Stop · PostToolUse · UserPromptSubmit · SessionEnd), noting auto-write is deferred.
In the design spec, change the header `> **Status:**` line to `> **Status:** implemented (Phase 4, two waves).`

- [ ] **Step 3: Full suite + build + manual smoke**

Run: `cd toolkit && npx vitest run && npm run build`
Expected: all tests PASS; build clean.

Manual smoke (from repo root, after build):
```bash
TMP=$(mktemp -d) && mkdir -p "$TMP/Markdown" && echo "# A" > "$TMP/Markdown/a.md"
( cd "$TMP" && echo '{"tool_input":{"file_path":"'"$TMP"'/Markdown/a.md"}}' | node "$OLDPWD/toolkit/dist/cli.js" hook PostToolUse )   # → {}
( cd "$TMP" && echo '{}' | node "$OLDPWD/toolkit/dist/cli.js" hook Stop )                                                          # → systemMessage: run /atomize
( cd "$TMP" && node "$OLDPWD/toolkit/dist/cli.js" pause ) && ( cd "$TMP" && echo '{}' | node "$OLDPWD/toolkit/dist/cli.js" hook Stop )  # → (silent)
```
Expected: Stop suggests before pause, silent after; no notes ever created in `$TMP`.

- [ ] **Step 4: Commit**

```bash
git add plugin/hooks.json README.md docs/superpowers/specs/2026-06-26-cortex-autonomy-hooks-phase4-design.md
git commit -m "feat(toolkit): register Wave-2 lifecycle hooks + Phase 4 docs complete"
```

- [ ] **Step 5: Push + PR**

```bash
git push -u origin feat/cortex-autonomy-hooks-phase4
gh pr create --fill
```

---

## Self-Review

**Spec coverage:**
- §3 state engine → Task 1. ✓
- §4 Wave-1 hooks (SessionStart, Stop) → Tasks 2–3. ✓
- §4 Wave-2 hooks (PostToolUse, UserPromptSubmit, SessionEnd) → Tasks 7–9. ✓
- §5 guards: draft barrier (no note writes, asserted in Task 2) ✓ · kill switch (Tasks 4/6) ✓ · scoped (Tasks 1/7) ✓ · idempotent (Task 1 union/clear) ✓ · debounce (detection at Stop/SessionStart) ✓ · quiet (one-line responses) ✓ · cost cap (Task 8) ✓ · fail-open (Task 3) ✓.
- §6 components → state.ts (T1), handlers.ts (T2,7,8,9), dispatch.ts (T3), commands/hook.ts+pause.ts (T4), plugin packaging (T5). ✓
- §6.6 / §9 wrapper + hooks.json → Tasks 5, 10. ✓
- `/cortex-pause` skill → Task 6. ✓
- Docs (README/CLAUDE per convention) → Tasks 6, 10. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `HookState`, `HookResponse`, `HandlerResult`, `Handler` defined in Tasks 1–2 and reused verbatim in Tasks 3–9. `runHook(vaultDir, event, stdinJson)` signature consistent across Tasks 3, 4, 5. `snapshotSources`/`reconcile`/`computeDirty`/`markDirty`/`clearDirty`/`setPaused` names match between Task 1 definition and Tasks 2/7/9 usage. `runQuery`/`formatQuery` reused from existing `commands/query.js` (verified present). ✓
