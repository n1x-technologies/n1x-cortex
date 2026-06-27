# Cortex MCP install — `cortex mcp install` + CLI help/version — Implementation Plan

> **Status:** approved, ready to execute in a fresh session.
> **Why:** connecting Cortex to Claude Code is too manual today (`claude mcp add cortex -- node .../dist/cli.js mcp <vault>`). Make it "install and done".
> **Work on the TS source in `toolkit/src/`, never `dist/`.** Branch → PR, never push to `main` directly (repo convention). Update the README in the same PR (N1X convention: README current on every push).
> **Approved decision:** registration mechanism = try the `claude` CLI first (`claude mcp add`, official + scope-aware), fall back to writing/merging `.mcp.json` for `project` scope. There is NO existing Claude Code plugin manifest in the repo to reuse (Fase 4 hooks go through `cortex hook`).

## Confirmed facts (from exploration)

- Dispatcher: `toolkit/src/cli.ts` — a `switch (cmd)` in `async main(argv)`. No `--help`/`--version` handling; the `default:` prints a usage string and `return cmd ? 1 : 0` (so `cortex --help` exits 1).
- **Bug:** `case 'mcp'` does `argv.slice(1).filter(a => !a.startsWith('--'))[0]` then `runMcp` → so `cortex mcp --help` strips the flag and **starts the stdio server → hangs**. Must intercept subcommands/flags before starting the server.
- `cortex mcp` resolves the vault from the first positional arg (absolute via `resolvePath(cwd, dir)`) else cwd. `runMcp` lives in `toolkit/src/commands/mcp.ts`; the server in `toolkit/src/mcp/server.ts`; pure tools in `toolkit/src/mcp/tools.ts`.
- The installed CLI knows its own absolute path via `realpathSync(fileURLToPath(import.meta.url))` (already used by `isEntrypoint` in cli.ts) — use this to register `node <abs cli.js> mcp <vault>` (most robust cross-platform, incl. Windows shims).

## Task 1 — CLI `--version`, `--help`, and `mcp` sub-routing

**Files:** `toolkit/src/cli.ts`; test `toolkit/test/cli-help.test.ts`.

- Add, at the top of `main`, before the `switch`:
  - `if (cmd === '--version' || cmd === '-v') { console.log(<version>); return 0; }` — read version from `package.json` (e.g. `createRequire(import.meta.url)('../package.json').version`, or read the file relative to dist).
  - `if (cmd === '--help' || cmd === '-h' || cmd === 'help' || !cmd) { printUsage(); return 0; }` — print the command list, **exit 0**. Extract the existing usage string into a `printUsage()` helper.
- Change `case 'mcp'` to route a subcommand:
  ```ts
  case 'mcp': {
    const rest = argv.slice(1);
    const sub = rest.find(a => !a.startsWith('--'));      // install | uninstall | undefined
    if (rest.includes('--help') || rest.includes('-h') || sub === 'help') { console.log(MCP_HELP); return 0; }
    if (sub === 'install')   { return runMcpInstall(cwd, rest); }
    if (sub === 'uninstall') { return runMcpUninstall(cwd, rest); }
    // no subcommand → run the server (vault = positional or cwd), unchanged
    const dir = rest.filter(a => !a.startsWith('--'))[0];
    await runMcp(dir ? resolvePath(cwd, dir) : cwd);
    return 0;
  }
  ```
  (Note: a bare vault path like `cortex mcp /vault` must still start the server — only the literal words `install`/`uninstall`/`help` are subcommands. Guard accordingly: treat the first positional as a subcommand only if it equals one of those keywords, else as the vault path.)
- Add `mcp` to the `default:` usage string if not already, and write `MCP_HELP` (usage for `cortex mcp [install|uninstall] [--vault <path>] [--scope local|project|user]`).
- **Tests:** call `main(['--version'])`, `main(['--help'])`, `main(['mcp','--help'])` and assert they return 0 and don't hang (capture console via a spy). The `mcp --help` test is the regression guard for the hang.

## Task 2 — `cortex mcp install` / `uninstall`

**Files:** create `toolkit/src/mcp/install.ts`; wrap in `toolkit/src/commands/mcp.ts` (`runMcpInstall`/`runMcpUninstall`); test `toolkit/test/mcp-install.test.ts`.

Design:
- **Args:** `--vault <path>` (else cwd, resolved absolute); `--scope local|project|user` (default `local`); server name fixed `cortex`.
- **Self-path:** `const cliPath = realpathSync(fileURLToPath(import.meta.url))` resolved to the installed `dist/cli.js`.
- **Registration (pure, testable core):** a function `mcpServerSpec(cliPath, vault)` → `{ command: 'node', args: [cliPath, 'mcp', vault] }`.
- **Mechanism:**
  1. If the `claude` CLI is on PATH (`which claude` / `where claude`): run `claude mcp add cortex --scope <scope> -- node <cliPath> mcp <vault>`. Idempotent: first `claude mcp remove cortex --scope <scope>` (ignore failure), then add. Surface stdout.
  2. Else, for `--scope project`: write/merge `.mcp.json` in the vault — `{ "mcpServers": { "cortex": mcpServerSpec } }`, merging with any existing file (don't clobber other servers). For `local`/`user` without the `claude` CLI: print a clear error + the exact `claude mcp add …` command to run by hand.
- **uninstall:** `claude mcp remove cortex --scope <scope>` if CLI present; else remove the `cortex` key from `.mcp.json` (project).
- **Output:** print what was done, the scope, the resolved vault, and `Verify with: claude mcp list`.
- **Idempotent + cross-platform:** remove-then-add for the CLI path; merge-by-key for `.mcp.json`; always `node <abs cli.js>` (never rely on the `cortex` shim on Windows).
- **Tests (no real `claude` CLI):** unit-test the pure parts — `mcpServerSpec` shape; the `.mcp.json` merge (write a temp dir with a pre-existing `mcpServers.other`, run the project-scope writer, assert both `other` and `cortex` present, `cortex` points to `node <cli> mcp <vault>`); idempotency (run twice → one `cortex` entry); uninstall removes only `cortex`. The `claude`-CLI branch is a manual smoke (`cortex mcp install` then `claude mcp list`).

## Task 3 — README

**File:** `README.md`.
- Replace the manual `claude mcp add cortex -- cortex mcp` in the MCP section with the new one-liner: `cortex mcp install` (and mention `--vault`/`--scope`, and `cortex mcp uninstall`). Keep `claude mcp list` as the verify step.
- Add `cortex mcp install` to the flow; ensure the **commands table already lists `cortex mcp`** (it does) and add a row/line for `mcp install` if useful.
- Scan for any stale "Phases 0–6" wording and fix to the current product framing (the new README shouldn't reference phases; verify none crept back).

## Execution

Use subagent-driven-development (or executing-plans). 3 tasks, each ending green (`npm test` from `toolkit/`, `npm run build` clean). Then `finishing-a-development-branch` → PR. After merge, this is a **minor** (`0.3.0`): bump `toolkit/package.json` → PR → merge → tag `v0.3.0` → CI publishes.
