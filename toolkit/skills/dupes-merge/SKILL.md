---
name: dupes-merge
description: Use when the user wants to clean up near-duplicate notes in the Cortex vault — "merge the duplicates", "dedupe my notes", or /dupes-merge. Finds near-duplicate pairs, merges each conservatively into one note (preserving all content + links), and folds the pair into a single note reversibly.
---

# Merge near-duplicate notes (reversible)

You are the **AI layer** that closes the Cortex `dupes` loop. The toolkit *finds* near-duplicates and does the deterministic, reversible mechanics (back up, redirect links, delete); **you** decide which pairs are truly the same idea and write the merged note. The toolkit never decides a merge on its own.

## Procedure

1. **Resolve the CLI.** Build the path to `toolkit/dist/cli.js` (run `npm run build` in `toolkit/` if `dist/` is missing). Run everything from the vault directory.

2. **Find the candidates.** Run `node <cli> dupes --json` and parse the array:
   ```json
   [ { "a": "path/a.md", "b": "path/b.md", "score": 0.0, "lexical": 0.0, "semantic": 0.0, "via": "lexical|semantic|both" } ]
   ```
   `via: "semantic"` pairs are paraphrases / translations TF-IDF can't see; `both` are the strongest signal. Higher `score` first.

3. **Judge each pair.** **Read both notes.** Only merge when they are genuinely the *same idea* — not merely related or sharing vocabulary. When in doubt, **skip** and tell the user (a wrong merge is worse than a surviving duplicate). Two notes that cover ideas which change independently must stay separate (Pillar 1).

4. **Choose the keeper.** Prefer the note that is more curated: more advanced `status`, more inbound links, better path (a curated folder over `_inbox/`). The other is the drop.

5. **Write the merged note.** Produce the **full merged file** for the keeper (frontmatter + body):
   - Integrate everything from both notes — lose no fact, citation, tag, or human edit.
   - Keep the keeper's `id` and its `# Heading`. Union the `tags`. Keep **all** `source` citations from both.
   - Write clean, atomic prose — not a concatenation. Resolve contradictions or flag them.
   - Save it to a temp file, e.g. `merged.md`.

6. **Apply (reversible).** Run `node <cli> merge "<keeper.md>" "<drop.md>" --content-file merged.md --write`.
   - The toolkit backs up both notes (and any note whose links it redirects), overwrites the keeper with your merged file, **redirects every `[[wikilink]]`** that pointed at the dropped note to the keeper, and deletes the dropped note.
   - Preview first without `--write` to see which inbound links will be redirected.

7. **Report + reassure.** Summarize each merge (kept / dropped / how many links redirected) and the ones you skipped with why. The whole run is reversible: `node <cli> undo` restores the keeper, recreates the dropped note, and reverts the link redirects.

## Safety

- **Conservative by default** — skip uncertain pairs; never merge notes that aren't the same idea.
- **Reversible** — every merge is backed up under one run; `cortex undo` reverses it completely.
- **Source files** under `Markdown/` are never touched — this operates only on graph notes.
- **Dry-run first** — run `merge` without `--write` to preview the redirects before committing.
