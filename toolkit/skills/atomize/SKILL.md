---
name: atomize
description: Use when the user wants to atomize a source document into draft Cortex notes — "atomize this doc", "turn this into atomic notes", or /atomize <source.md>. Distills each section into one-idea-per-note drafts (type, folder, tags, wikilinks) and writes them safely into _inbox/ via the cortex toolkit.
---

# Atomize a source into AI-distilled draft notes

You are the **AI layer** of the N1X Cortex atomize pipeline. The `cortex` toolkit is the deterministic engine; you do the distillation. Every file write goes through the toolkit — you only produce data.

## Procedure

1. **Resolve the source.** Confirm the source markdown path (under the vault's `Markdown/`). Build the CLI path to `toolkit/dist/cli.js` (run `npm run build` in `toolkit/` first if `dist/` is missing).

2. **Emit the plan.** Run `node <cli> atomize "<source.md>" --emit-json` from the vault dir. Parse the JSON: `segments`, `knownTypes`, `knownFolders`, `existing`, `statusFirst`, `lang`, `fields`.

3. **Distill each segment** into one or more atomic notes, following the methodology:
   - **Atomic — one idea per note.** If a segment covers two things that could change independently, split it into multiple notes (Pillar 1).
   - **Type:** choose from `knownTypes`. Only introduce a new type when none fits — and call it out in the preview.
   - **Folder:** route from `knownFolders` (match the vault's type→folder convention).
   - **Cold-vault fallback:** if `knownTypes`/`knownFolders` are empty, use the methodology's canonical vocabulary (types `concept/flow/rule/technical/error/security/ux/mvp/strategy`; folders `01-Concepts/ … 09-Strategy/`), localized to `lang` when set, and note in the preview that a new taxonomy is being seeded.
   - **Body:** rewrite into clean, structured natural language — not a copy of the source. For flow/process notes, add an *Implications for implementation* section.
   - **Connect:** add `[[wikilinks]]` to related sibling notes and to notes in `existing`. Dangling links are valid (Pillar 2).
   - **Tags + language:** add `tags`; write in the vault's `lang`.
   - **No duplicates:** if a strong match already exists in `existing`, drop that note (the toolkit will also skip it).

4. **Write the distilled specs** to a temp file `distilled.json`:
   `{ "source": "<emit.source>", "notes": [ { "title", "type", "folder", "tags": [...], "body", "fromHeading" }, ... ] }`.

5. **Dry-run and preview.** Run `node <cli> atomize --apply distilled.json` (no `--write`). Show the user the plan summary: note count, each title `[type → folder]`, splits, any skips or newly-seeded types. **Stop and ask: apply these to _inbox/?**

6. **Apply on approval.** On "go," run `node <cli> atomize --apply distilled.json --write`. Report what landed under `_inbox/<folder>/`. The notes are `status: draft` in the `_inbox/` staging area — the user reviews and promotes them into the curated folders.

## Safety (enforced by the toolkit, but respect them)

- Dry-run is the default; only `--write` writes. Always preview before writing.
- Notes land only in `_inbox/<folder>/` as `status: draft`. Never write into curated folders directly.
- Never modify the source file or existing notes.
- Citations are mandatory (the toolkit adds them); keep the `source` correct.
