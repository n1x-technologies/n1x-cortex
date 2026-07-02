---
name: atomize
description: Use when the user wants to atomize a source document into draft Cortex notes — "atomize this doc", "turn this into atomic notes", or /atomize <source.md>. Distills each section into one-idea-per-note drafts (type, folder, tags, wikilinks) and writes them safely into _inbox/ via the cortex toolkit.
---

# Atomize a source into AI-distilled draft notes

You are the **AI layer** of the N1X Cortex atomize pipeline. The `cortex` toolkit is the deterministic engine; you do the distillation. Every file write goes through the toolkit — you only produce data.

## Procedure

1. **Resolve the source.** Confirm the source markdown path (under the vault's `Markdown/`). Build the CLI path to `toolkit/dist/cli.js` (run `npm run build` in `toolkit/` first if `dist/` is missing).

2. **Emit the plan.** Run `node <cli> atomize "<source.md>" --emit-json` from the vault dir. Parse the JSON: `segments`, `knownTypes`, `knownFolders`, `existing`, `statusFirst`, `lang`, `fields`.

3. **Distill each segment** into one or more atomic notes, following the `instructions` field emitted by the toolkit. The emit output now carries the full distillation methodology (atomic notes, type/folder routing, the phantom-wikilink prohibition, update-vs-create-vs-skip, cold-vault taxonomy, citations) — treat that `instructions` text as authoritative. Produce the note specs it describes.

4. **Write the distilled specs** to a temp file `distilled.json`. The `notes` array holds two possible shapes — mix them freely:
   ```json
   {
     "source": "<emit.source>",
     "notes": [
       { "title": "...", "type": "...", "folder": "...", "tags": ["..."], "body": "...", "fromHeading": "..." },
       { "action": "update", "targetPath": "<existing note path>", "title": "...", "body": "<full merged body>" }
     ]
   }
   ```
   Create notes (first shape, no `action`/`targetPath`) become new `_inbox/` drafts. Update notes (second shape) merge into the existing note at `targetPath` in place.

5. **Apply autonomously.** Write `distilled.json`, then run `node <cli> atomize --apply distilled.json --write`. The toolkit creates new drafts under `_inbox/` and merges `update` notes in place. Print a compact summary (creates, updates with their targets, any skips) — this is information, not a checkpoint.

6. **Reassure + reversibility.** Tell the user what changed and that **every edited note was backed up** — any update is undoable with `cortex atomize --undo` (or via git). Updates skipped by the shrink guard are reported; re-run with `--force` only if the shrink is intended.

7. **Graduate ready notes (optional, autonomous).** For each note you created or updated that you judge **complete and correct**, advance its status and promote it into the curated graph:
   - `node <cli> set-status "<_inbox path>" documented --write` — your confidence is the trust signal; leave notes you are unsure about as `draft` in `_inbox/`.
   - then `node <cli> promote --write` — graduates every note whose status is now beyond `draft` into its curated folder (`_inbox/03-Rules/x.md` → `03-Rules/x.md`). It never overwrites an existing curated note.
   - Report what was promoted. The whole run is reversible: `node <cli> undo` reverses the most recent action (a promotion returns the note to `_inbox/`; an edit or status change is rolled back).

## Safety (enforced by the toolkit, but respect them)

- Dry-run is the default; only `--write` writes. Always preview before writing.
- **New notes** (creates) land only in `_inbox/<folder>/` as `status: draft` — they are never written as brand-new files into curated folders directly.
- **Source files** under `Markdown/` are never modified. Existing curated notes are only ever changed through the `update` path, which backs up each note before editing. Every change — an edit, a `set-status` advance, or a `promote` move — is reversible: `cortex undo` reverses the most recent run.
- Citations are mandatory (the toolkit adds them); keep the `source` correct.
