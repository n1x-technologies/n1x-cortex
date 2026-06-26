# Cortex Atomize 3.3 — `promote`: autonomous, reversible graduation of ready drafts — design

> **Status:** approved design, pending implementation plan.
> **Builds on:** Phase 3 / 3.1 / 3.2 — shipped on `main`. Reuses the 3.2 reversibility model (`.cortex/backups/`, `backupNote`, `restoreLatestBackup`).
> **Branch:** `feat/cortex-atomize-promote-phase3-3`.

## 1. Goal

Close the last manual step of the atomize pipeline. Today the agent creates drafts in `_inbox/<folder>/` (3.1) and merges updates into existing notes (3.2), but **a human still has to hand-move drafts from `_inbox/` into the curated folders**. Phase 3.3 adds **`cortex promote`** — it graduates *ready* drafts out of `_inbox/` into their already-chosen curated folder, **autonomously and reversibly**.

"Ready" is gated on the note's lifecycle `status`: a draft graduates only once its status has advanced **beyond** `statusLifecycle[0]` (`draft`). The status advance is the trust signal — set by a human review, or by the agent itself via the small reversible `set-status` primitive this phase adds (so the loop can run fully autonomously, per-note, without ever auto-trusting at creation time).

## 2. Why a status gate (not promote-all)

The `_inbox/` draft barrier exists so AI output never silently lands in the curated graph. Promotion preserves that barrier: **notes are still created as `draft`** (3.1 unchanged), and promotion requires an explicit advancement to `documented`/`verified`. That advancement is a deliberate per-note decision — a human's review, or the agent's confidence on a review pass — never a blanket dump. Everything is reversible, so autonomy is safe because it's undoable.

## 3. Architecture

Same deterministic-engine model. Two new vault operations, both reversible, plus a generalized undo:

```
cortex set-status <note> <status> [--write]   # advance a draft's status (reversible)
cortex promote [--write]                       # graduate _inbox/ notes whose status > draft
cortex undo                                    # reverse the most recent run (edits, status patches, OR promotions)
```

`set-status` reuses the 3.2 edit-backup path (`backupNote`). `promote` records its moves in a per-run journal. `undo` is generalized to reverse whichever kind of run was latest.

## 4. The reversibility model (extended from 3.2)

- **Edits & status patches** → content backup to `.cortex/backups/<runId>/<relPath>` (3.2 mechanism, unchanged).
- **Promotions** → a move journal at `.cortex/promotions/<runId>.json` = `[{ "from": "_inbox/03-Rules/x.md", "to": "03-Rules/x.md" }]` (no content backup needed — a move preserves content; undo reverses the move).
- **`undoLatestRun(vaultDir)`** finds the lexicographically-greatest `runId` across **both** `.cortex/backups/` (dir names) and `.cortex/promotions/` (file basenames). If the latest run is a promotion journal → reverse each move (`to` → `from`). Otherwise → restore the backed-up files (the existing `restoreLatestBackup`). Returns `{ restored: string[]; reverted: string[] }`. A run is always one or the other (a single command either backs up edited content or records moves), so dispatch is unambiguous.

`cortex atomize --undo` (shipped in 3.2) is repointed to `undoLatestRun` so it also reverses promotions/status-patches; a new top-level `cortex undo` is the canonical alias.

## 5. Components

### 5.1 `set-status.ts` (new) — the advance primitive
- `setStatus(vaultDir, notePath, newStatus, config, opts?: { dryRun?; runId? }): { changed: string | null; backup: string | null; skipped?: { target; reason } }`.
- Safety gates (realpath-based, mirroring 3.2): `notePath` must resolve **inside the vault**, **exist**, and **not** be under `config.sourcesDir` (`Markdown/`). A failing target is skipped (`outside-vault` | `not-found` | `source-immutable`), never written.
- Patches **only** the `status` line of the frontmatter block textually (keep the rest verbatim): replace the line matching `^<config.fields.status>:` with `<status>: "<newStatus>"`; if absent, insert it before the closing `---`. Dry-run writes nothing/no backup; `--write` backs up (`backupNote`) then patches. Reversible via `undo`.

### 5.2 `promote.ts` (new) — graduate ready drafts
- `planPromote(vaultDir, config): { items: { from: string; to: string; action: 'promote' | 'skip'; reason?: string }[] }`.
  - Eligible = a `scanVault` note whose top-level folder is `_inbox`, in a **subfolder** (`_inbox/<folder>/<file>.md`), with `status` non-null and `status !== statusLifecycle[0]`.
  - `to` = the path with the leading `_inbox/` stripped (`_inbox/03-Rules/x.md` → `03-Rules/x.md`).
  - Skip reasons: `still-draft` (status null or == `draft`), `no-target-folder` (note directly under `_inbox/` with no subfolder), `exists` (a curated note already lives at `to` — never clobbered).
- `applyPromote(vaultDir, plan, opts?: { dryRun?; runId? }): { promoted: { from; to }[]; skipped: { from; reason }[] }`.
  - Dry-run by default: nothing moved, no journal.
  - On `--write`, per promote item: realpath-confine `to` (in-vault, not under `Markdown/`), `mkdirSync(dirname(to))`, write `to` with `from`'s bytes, `rm(from)`; collect the move. Then write the journal `.cortex/promotions/<runId>.json`.

### 5.3 commands + CLI
- `runSetStatus`, `runPromote` (+ `formatPromote`), and a generalized `runUndo` (→ `undoLatestRun`) in the commands layer.
- `cli.ts`: new cases `promote` (`[--write]`), `undo`, `set-status <note> <status> [--write]`; repoint `atomize --undo` to the generalized undo; usage string → `cortex <init|status|orphans|viz|query|atomize|promote|undo|set-status>`.

### 5.4 the `/atomize` skill
After create/update, the skill closes the loop autonomously:
1. For each new/updated note the agent judges **complete and correct**, run `cortex set-status <inbox-path> documented --write` (its confidence is the trust signal; unsure notes stay `draft`).
2. Run `cortex promote --write` to graduate every now-ready note into its curated folder.
3. Report what was promoted and that the whole run is reversible with `cortex undo`.

The draft barrier stays intact (creation is always `draft`); advancement is a separate, deliberate, reversible act.

## 6. Safety guarantees

- **Sources immutable** — neither `set-status` nor `promote` can write under `Markdown/` (realpath gate).
- **Never clobbers curated notes** — promote skips when `to` already exists.
- **In-vault only** — all targets validated to resolve inside the vault.
- **Draft barrier intact** — notes are still created as `draft`; only advanced status promotes.
- **Dry-run by default**; **fully reversible** — `cortex undo` reverses the latest run (edit, status patch, or promotion); **idempotent** (a promoted note is no longer in `_inbox/`, so re-running is a no-op).

## 7. Scope

**In:** `cortex promote` (status-gated graduation, reversible) · the `set-status` advance primitive · generalized `undo` (edits + status patches + promotions) · `/atomize` skill loop-closing · README/CLAUDE.

**Out (later / Phase 3.4+):** multi-source frontmatter; tag-union on update; structured 3-way merge; `undo` of a *specific* (not just latest) run; route-in-place (write new notes straight to curated, bypassing `_inbox/` — promote already covers graduation); auto-advancing status as a dedicated Curate-pillar agent (Phase 4); the minor 3.2 hardening items (symlink write-escape, BOM-before-frontmatter, unknown-action, dup-targetPath backup).

## 8. Testing

TDD against temp vaults:
- **set-status:** patches only the status line (rest of frontmatter verbatim); inserts when absent; dry-run no-write/no-backup; `--write` backs up then patches; `Markdown/`/missing/out-of-vault targets skipped; `undo` restores.
- **promote:** eligibility (status > draft in a subfolder); `still-draft`/`no-target-folder`/`exists` skips; dry-run moves nothing; `--write` moves `_inbox/<f>/x.md` → `<f>/x.md`, removes the inbox copy, writes the journal; never writes under `Markdown/`; idempotent re-run.
- **undoLatestRun:** reverses a promotion run (moves back to `_inbox/`); reverses an edit/status run (restores content); picks the newest across both stores; `{ restored, reverted }` correct; empty → both `[]`.
- Full suite stays green; `npm run build` clean. Manual smoke: extend the dogfood vault — create drafts, `set-status documented`, `promote`, confirm the note lands in the curated folder, then `undo` and confirm it returns to `_inbox/`.

## 9. File structure (planned)

```
toolkit/
├── src/atomize/
│   ├── set-status.ts            — setStatus (reversible status patch) (new)
│   ├── promote.ts               — planPromote / applyPromote + journal (new)
│   └── backup.ts                — recordPromotions + undoLatestRun (generalize undo) (modify)
├── src/commands/
│   ├── promote.ts               — runPromote / formatPromote / runSetStatus / runUndo (new)
│   └── atomize.ts               — repoint runUndo to undoLatestRun (modify)
├── src/cli.ts                   — promote / undo / set-status cases; atomize --undo alias (modify)
├── skills/atomize/SKILL.md      — loop-closing: set-status → promote → undo (modify)
└── test/
    ├── set-status.test.ts       — (new)
    ├── promote.test.ts          — (new)
    └── backup.test.ts           — undoLatestRun dispatch (modify)
```

Docs: README (`What it does today` table + engine CLI lines + roadmap `Phase 3.3 ✓`) and CLAUDE updated, per the README-on-every-push convention.
