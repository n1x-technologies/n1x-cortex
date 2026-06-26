# Cortex Atomize 3.2 — the `update` action (autonomous, reversible merge) — design

> **Status:** approved design, pending implementation plan.
> **Builds on:** Phase 3 (mechanical atomize) + Phase 3.1 (AI-distilled notes) — both shipped on `main`.
> **Branch:** `feat/cortex-atomize-update-phase3-2`.

## 1. Goal

Today, when a distilled note matches an existing note, `atomize` only **skips** it. Phase 3.2 adds the **`update` action**: the AI agent **merges new information into the existing note in place**, so the engine moves from *"only creates new drafts"* to *"maintains the graph."*

The product directive is **maximum autonomy + reliability with no extra work for the user**: the tool should do the merge, not hand the user a pile of proposals to reconcile by hand. The way we make autonomous in-place editing safe is **reversibility + conservative merging + tests** — autonomy is safe because every edit is *undoable*, not because the user pre-approves each one.

This is the first time the toolkit writes outside `_inbox/` (it edits a curated note), so the safety model is the heart of this phase.

## 2. Reliability model (the headline)

Three independent guarantees make autonomous updates trustworthy:

1. **Reversibility — the safety net.** Before editing *any* existing note, the toolkit copies the current file to `.cortex/backups/<runId>/<vault-relative-path>` (the `.cortex/` dir is dot-prefixed, so `scanVault` never indexes it). `cortex atomize --undo` restores the most recent backup set. Combined with git (markdown vaults are normally versioned), every update is a one-command rollback.
2. **Conservative, frontmatter-safe merge.** An update **never rewrites frontmatter** — the existing YAML block is kept **verbatim** (id, type, status, tags, source all preserved). Only the **body** is replaced with the agent's merged prose, and the agent is instructed to *integrate* new info while preserving existing content, links, and human edits — never to drop or condense away what's there.
3. **Shrink guard.** The toolkit refuses an update whose merged body is **less than 50%** of the existing body's length (a cheap "did we just delete content?" heuristic), unless `--force` is passed. Reported in the plan.

Plus: **dry-run by default** (the CLI primitive is unchanged — `--write` applies), **idempotent** (re-running yields `skip` once the note already contains the info), and the update path is **heavily tested**.

> The toolkit cannot semantically verify that a merge preserved meaning — so reliability comes from *reversibility + the shrink guard + the agent's conservative-merge discipline*, not from the engine diffing prose.

## 3. Architecture

Same two-seam model as 3.1 (toolkit = deterministic engine; the `/atomize` skill = AI layer). The agent decides *what* to merge; the toolkit applies it reversibly.

```
cortex atomize src.md --emit-json   →  plan.json   (segments + existing notes incl. paths)
        ↓  /atomize skill: for a segment that matches an existing note, the agent READS that note
           and produces a MERGED body → emits an `update` item (action:"update", targetPath, body)
   distilled.json
        ↓
cortex atomize --apply distilled.json [--write]
        ├─ create items → _inbox/<folder>/<id>.md           (unchanged from 3.1)
        └─ update items → back up target → write merged body in place at targetPath
cortex atomize --undo                →  restore the most recent backup set
```

The agent reads the existing note directly (it has the path from emit's `existing[]`); the toolkit owns every **write** and every **backup**.

## 4. Data contract changes (`types.ts`)

- `DistilledNote` gains:
  - `action?: 'create' | 'update'` (default `'create'`).
  - `targetPath?: string` — required when `action: 'update'`; the vault-relative path of the existing note to merge into (from emit's `existing[].path`).
- `AtomizePlanItem.action` already includes `'update'` (defined in Phase 3, unused until now).
- New result type: `applyDistilled` returns `{ plan, written: string[], updated: string[], backups: string[], skipped: { target: string; reason: string }[] }` (e.g. shrink-guard skips).

## 5. Components

### 5.1 `reconcile` — unchanged
Reconcile keeps deciding `create | skip` for **create-intent** notes (duplicate protection unchanged). **Update intent is the agent's call**, expressed explicitly via `action:'update' + targetPath`; update items bypass reconcile and are validated by the apply step instead.

### 5.2 `backup.ts` (new) — reversibility
- `backupNote(vaultDir, relPath, runId): string` — copies `<vault>/<relPath>` to `.cortex/backups/<runId>/<relPath>` (creating dirs); returns the backup path. `runId` is a timestamp string generated once per apply run.
- `restoreLatestBackup(vaultDir): { restored: string[] }` — finds the newest `.cortex/backups/<runId>/` set and copies each file back over its original location. Powers `--undo`.

### 5.3 `renderUpdatedNote(existingContent, mergedBody, newSource)` (new, in `render.ts`)
Frontmatter-safe, textual merge — **no YAML serializer** (keeps the engine dependency-free and the frontmatter byte-stable):
- Split `existingContent` into the verbatim frontmatter block (the `---` … `---` fence, kept exactly) and the old body.
- New content = `frontmatterBlock` + the agent's `mergedBody` + a guaranteed `*Source: [[newSource]]*` line **appended only if** that exact citation isn't already in `mergedBody` (so a note updated from a second source ends up citing both).
- Frontmatter (id/type/status/tags/source) is **untouched**. (Multi-source *frontmatter* — turning `source:` into a list — is deferred; new sources show up as body citations, which the graph already indexes.)

### 5.4 `applyDistilled` / `applyUpdate` (extend `apply-distilled.ts`)
- **create** items: unchanged from 3.1 (`_inbox/<folder>/<id>.md`, reconcile, de-collision, `_inbox/` confinement).
- **update** items, per note:
  1. **Validate `targetPath`** (hard safety gates): it must resolve (via `resolve`) to a path **inside the vault**, the file must **already exist**, and it must **not** be under `config.sourcesDir` (`Markdown/`) — sources stay immutable. A target failing any gate is skipped with a reason (never created, never written).
  2. **Shrink guard:** if `len(mergedBody) < 0.5 × len(existingBody)` and not `--force`, skip with reason `shrink-guard`.
  3. **Back up** the target (`backupNote`).
  4. **Render** with `renderUpdatedNote` and **write in place** — only when `dryRun === false`. On dry-run, produce a unified-diff string for the plan and write nothing (no backup either).
- The existing `_inbox/` resolved-path containment guard still governs **create** writes; **update** writes are governed by the targetPath gates above (exists + in-vault + not-a-source).

### 5.5 CLI (`cli.ts`)
- `atomize --apply <file> [--write] [--force]` — `--force` overrides the shrink guard.
- `atomize --undo` — restore the most recent backup set; print what was restored.
- `formatDistilledPlan` extended to show update items (`update → <targetPath>` with the diff/line-delta) and any shrink-guard/validation skips.

### 5.6 The `/atomize` skill (`toolkit/skills/atomize/SKILL.md`)
- For a segment that matches a note in emit's `existing[]` **and adds information**, the agent: **reads** that note (`targetPath`), produces a **conservative merged body** (integrate new info; preserve all existing content, links, and human edits; keep every source citation and add the new one), and emits an `action:"update"` item with `targetPath` + merged `body`. If the existing note already covers the segment, it stays `skip` (don't churn).
- **Autonomy / low-friction UX:** the skill **auto-applies** (`--apply --write`), shows a compact summary (creates + updates with line-deltas) as information, and tells the user that every edit is backed up and reversible with `cortex atomize --undo` (or git). No mandatory checkpoint — the reliability net is reversibility, not pre-approval.

## 6. Write-safety guarantees (updated for 3.2)

- **Sources still immutable** — `Markdown/` can never be a target (hard gate).
- **Reversible** — every edited note is backed up before the write; `--undo` restores.
- **Frontmatter-stable** — updates never rewrite YAML; only the body changes.
- **No silent data loss** — shrink guard blocks suspicious updates unless forced.
- **Dry-run by default**; **idempotent**; **create path unchanged** (still `_inbox/`-confined).
- **In-vault only** — update targets are validated to resolve inside the vault and to be existing tracked notes.

## 7. Scope

**In:** the `update` action (agent-driven, in-place, conservative merge) · automatic per-run backups + `--undo` · shrink guard · `--force` · dry-run diff for updates · skill auto-apply UX.

**Out (later):** route-in-place / auto-promotion out of `_inbox/`; multi-source *frontmatter* (list-valued `source`); tag-union on update (v1 keeps frontmatter verbatim); a structured 3-way merge; cross-note refactors (splitting/merging existing notes).

## 8. Testing

TDD against temp vaults:
- **backup/undo:** `backupNote` copies to `.cortex/backups/<runId>/…`; `restoreLatestBackup` restores byte-for-byte; round-trip (edit → undo → original).
- **renderUpdatedNote:** frontmatter block preserved verbatim; body replaced; new-source citation appended only when absent; existing citation kept.
- **applyDistilled update path:** dry-run writes nothing (and creates no backup); `--write` backs up then writes in place; `Markdown/` target is hard-blocked; non-existent target skipped; out-of-vault/`..` target blocked; shrink guard skips unless `--force`; idempotent re-run.
- **safety:** an update can never create a new file (only edit existing), never touch a source, never escape the vault.
- Full suite stays green; `npm run build` clean. Manual smoke: extend the dogfood vault — re-atomize an updated source and confirm an existing note is merged, backed up, and `--undo` restores it.

## 9. File structure (planned)

```
toolkit/
├── src/types.ts                 — DistilledNote.action/targetPath; applyDistilled result type (modify)
├── src/atomize/
│   ├── backup.ts                — backupNote / restoreLatestBackup (new)
│   ├── render.ts                — renderUpdatedNote (modify)
│   └── apply-distilled.ts       — update path: validate → shrink-guard → backup → in-place write (modify)
├── src/commands/atomize.ts      — runApply (--force), runUndo, formatDistilledPlan updates (modify)
├── src/cli.ts                   — --force, --undo wiring (modify)
├── skills/atomize/SKILL.md      — update intent + conservative-merge rules + auto-apply UX (modify)
└── test/
    ├── backup.test.ts           — (new)
    ├── render.test.ts           — renderUpdatedNote cases (modify)
    └── apply-distilled.test.ts  — update path + safety (modify)
```

Docs: README + CLAUDE updated for the `update` action, `--undo`, and the reversibility model (per the README-on-every-push convention).
