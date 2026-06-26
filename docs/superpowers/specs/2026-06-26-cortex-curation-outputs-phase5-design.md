# Cortex Phase 5 — Curation & Outputs: gaps · dupes · verify · moc · doc — design

> **Status:** approved direction, pending implementation plan.
> **Builds on:** Phases 0–4 — shipped on `main`. Reuses the engine (`scanVault`, `buildGraph`, `buildIndex`/`searchIndex`), the Phase 4 `.cortex/state.json` snapshot, the 3.2/3.3 reversibility model (`backupNote`, `.cortex/backups/`, `cortex undo`), and the existing `templates/typst/` engine.
> **Branch:** `feat/cortex-curation-outputs-phase5`.

## 1. Goal

Complete the methodology cycle. Cortex already does **Atomize · Connect · AI Layer**; Phase 5 finishes **Curate + Outputs** so the product delivers the whole loop end to end. Five commands, all thin layers over the proven engine:

- **Diagnostics (read-only):** `cortex gaps`, `cortex dupes`, `cortex verify <note>`.
- **Producers (write artifacts, reversible / regenerable):** `cortex moc <topic>`, `cortex doc <topic>`.

No new engine concepts. Every command reuses the existing graph, FTS index, snapshot, and reversibility primitives. Sources under `sourcesDir` are never modified.

## 2. Design principles (inherited)

- **Dry-run by default for writers** (`moc`); `--write` to apply, reversible via `cortex undo`.
- **Read-only diagnostics never write** (`gaps`, `dupes`, `verify`); they print a report.
- **Schema-agnostic** — use `config.fields` (type/status/source) and `statusLifecycle`, never hard-coded field names. Vault-specific notions ("flows", "rules") are generalized to "a note and its link closure".
- **Deterministic** — same vault → same output; no AI in the engine layer (AI stays in the `/atomize` skill).
- **Quiet, structured output** — mirror the existing `status`/`orphans` formatting.

## 3. Architecture

Each command follows the established split: a pure `plan`/compute function in `src/curate/` (or reuse `src/atomize/`), a `commands/<name>.ts` wrapper (`run*` + `format*`), and a `cli.ts` case. New config keys are optional with inferred defaults — no `.cortex.json` change required.

```
cortex gaps                         # coverage report (read)
cortex dupes [--threshold N]        # near-duplicate pairs (read)
cortex verify <note> [--hops N]     # link-closure completeness checklist (read)
cortex moc <topic> [--write]        # (re)generate a Map-of-Content note (write, reversible)
cortex doc <topic> [--pdf]          # consolidate notes → .typ (+ optional PDF) (output artifact)
```

New config (all optional, defaulted in `loadConfig`):
```jsonc
{
  "mocDir": "00-MOC",        // where moc notes are written
  "dupeThreshold": 0.45,     // cosine cutoff for dupes
  "outDir": ".cortex/out"    // doc artifacts (git-ignored)
}
```

---

## WAVE 1 — Diagnostics (read-only)

### 4. `cortex gaps` — coverage report

Answers "what still needs curation?" in one view. Three buckets, computed from the engine + Phase 4 snapshot:

- **Unatomized sources** — files under `sourcesDir` that **no note cites**. Computed as `snapshotSources(...)` keys minus the set of resolved `note.source` targets. (A source is "atomized" once at least one note's `source` field points at it.)
- **Stale sources** — cited sources whose current file mtime is newer than the mtime recorded in `.cortex/state.json` (`state.sources`, the Phase 4 snapshot): the source changed since it was last seen. Computed via `computeDirty(state.sources, liveSnapshot)` intersected with cited sources. If no snapshot exists yet, this bucket is empty (not an error).
- **Notes missing citations** — notes with `note.source == null`, **excluding** notes whose `type` is a structural type (`moc`) or that live under `mocDir` (MOCs legitimately have no source).
- **Stuck drafts** — notes with `status === statusLifecycle[0]` (`draft`).

**Module:** `src/curate/gaps.ts` → `computeGaps(vaultDir, config, state): GapsReport`
```ts
interface GapsReport {
  unatomizedSources: string[];        // source paths with no citing note
  staleSources: string[];             // cited sources changed since atomize
  notesMissingCitation: string[];     // note paths
  stuckDrafts: string[];              // note paths
}
```
**Command:** `runGaps` + `formatGaps` (counts header + each bucket, capped list like `orphans` at 30). **CLI:** `case 'gaps'`.

### 5. `cortex dupes` — near-duplicate detection

Surfaces notes that likely cover the same idea (atomicity guard, made mechanical). Reuses `buildIndex` (tf-idf already weighted title×3, tags×2, body×1). Computes pairwise **cosine similarity** over tf-idf vectors and reports pairs ≥ `threshold`, sorted desc, as merge candidates.

- Vector per note = `{ term → tf · idf }` from the existing index maps.
- To bound cost, only score pairs that share ≥1 term (invert via `df`); `O(n²)` worst case is fine for vault sizes (thousands).
- Output is advisory only — it suggests `merge` (the human/`/atomize` does the merge); **nothing is written.**

**Module:** `src/curate/dupes.ts` → `computeDupes(vaultDir, config, threshold): DupePair[]`
```ts
interface DupePair { a: string; b: string; score: number }   // a,b = note paths; score 0..1
```
**Command:** `runDupes` + `formatDupes` (`A  ⇄  B   0.72`). **CLI:** `case 'dupes'` with `--threshold` (default `config.dupeThreshold`).

### 6. `cortex verify <note>` — link-closure completeness

The generic form of "walk a flow's links to its rules." Given a note, walk its **outbound link closure** to `--hops` (default 2) and produce a checklist: for each reachable linked target, is it (a) present (not a gap), (b) cited (`source != null`), (c) advanced (`status === last(statusLifecycle)`)? Unmet items are the "compliance gaps" for that note.

**Module:** `src/curate/verify.ts` → `verifyNote(vaultDir, config, notePath, hops): VerifyReport`
```ts
interface VerifyItem { target: string; exists: boolean; cited: boolean; verified: boolean }
interface VerifyReport { root: string; hops: number; items: VerifyItem[]; ok: boolean }  // ok = all items exist
```
- BFS over `graph` edges from the root note's resolution key, deduped, depth-limited.
- `verified` uses `statusLifecycle[statusLifecycle.length - 1]`.
**Command:** `runVerify(vaultDir, notePath, { hops })` + `formatVerify` (✓/✗ columns; footer `N targets · M gaps`). **CLI:** `case 'verify'` (requires a `<note>` positional).

---

## WAVE 2 — Producers (write / output)

### 7. `cortex moc <topic>` — (re)generate a Map of Content

Replaces hand-maintained Dataview MOCs. Selects the topic's notes, groups them, and writes a MOC note of wikilinks. **Regenerates in place** (the whole point), so it backs up any existing MOC and is reversible.

- **Selection:** a note belongs to `<topic>` if `topic ∈ note.tags`, OR `note.type === topic`, OR `note.folder === topic`. (Union; case-insensitive.) Excludes notes already under `mocDir`.
- **Grouping:** by `type` (fallback `folder`), each group a `## <Group>` heading with a sorted `- [[note-id]]` list (titles as alias: `[[id|Title]]`).
- **Output note:** `<mocDir>/<topic>.md` with frontmatter `type: moc`, `status: draft`, `title: "<Topic> — MOC"`; body = intro line + grouped lists. No `source` (MOCs are structural — consistent with the `gaps` exclusion).
- **Reversibility:** dry-run by default (prints the planned MOC); on `--write`, `backupNote` the existing file (if any) under `.cortex/backups/<runId>/`, then write. `cortex undo` restores. Never writes under `sourcesDir`.

**Module:** `src/curate/moc.ts` → `planMoc(vaultDir, config, topic): MocPlan` and `applyMoc(vaultDir, plan, config, { dryRun, runId }): { written: string \| null; backup: string \| null }`.
```ts
interface MocGroup { name: string; entries: { id: string; title: string }[] }
interface MocPlan { topic: string; dest: string; groups: MocGroup[]; count: number }
```
**Command:** `runMoc` + `formatMoc`. **CLI:** `case 'moc'` (`<topic> [--write]`).

### 8. `cortex doc <topic>` — consolidate notes → Typst (+ optional PDF)

Produces a polished, branded document from a topic's notes using the existing `templates/typst/` engine (`template.typ` + `brand.typ`, `typst` already installed).

- **Selection:** same predicate as `moc`; if a `<mocDir>/<topic>.md` MOC exists, follow its link order (so a curated MOC drives the document order); otherwise group like `moc`.
- **Render:** emit a `.typ` that `#import "<relpath>/template.typ": *` and `#show: doc.with(title: "<Topic>", doc-label: "Cortex", client: "N1X Technologies", date: "<YYYY>", lang: config.lang ?? "en")`, then one `= <note title>` section per note with the body converted markdown→Typst.
- **md→Typst conversion (minimal, scoped to what notes contain):** a small TS converter (`src/curate/md2typ.ts`) handling: ATX headings (`#`→`=`, depth-shifted under the section), paragraphs, `-`/`*` bullet lists, `**bold**`/`*italic*`, inline code, and `[[wikilinks]]` → plain bold text (PDF has no vault links). Everything else passes through as escaped text. (No tables/images in v1 — YAGNI.)
- **Output:** writes `<outDir>/<topic>.typ`. With `--pdf` and `typst` on PATH, runs `typst compile <topic>.typ <topic>.pdf`; otherwise prints the `.typ` path and the compile command to run. `outDir` is git-ignored. **No vault note is written**, so this needs no backup/undo — re-running regenerates.
- **Brand:** uses `brand.typ` as-is (the navy/coral N1X palette); attribution comes from the template chrome.

**Module:** `src/curate/doc.ts` → `planDoc(vaultDir, config, topic): DocPlan` and `renderDocTyp(plan, config): string`; `src/curate/md2typ.ts` → `mdToTyp(markdown: string, headingShift: number): string`.
```ts
interface DocPlan { topic: string; notes: { title: string; body: string }[]; dest: string }
```
**Command:** `runDoc(vaultDir, topic, { pdf })` + `formatDoc`. **CLI:** `case 'doc'` (`<topic> [--pdf]`).

## 9. Safety & guarantees

- **Sources immutable** — no command writes under `sourcesDir` (realpath gate on `moc`; `doc` writes only to `outDir`).
- **Read-only diagnostics** — `gaps`/`dupes`/`verify` never touch the filesystem (except reading).
- **`moc` reversible** — dry-run default, `backupNote` + `cortex undo`; never clobbers without a backup.
- **`doc` regenerable** — artifacts in git-ignored `outDir`; no vault mutation.
- **In-vault, deterministic, idempotent** — same vault → same report/artifact.

## 10. Scope

**In:** `cortex gaps` · `cortex dupes` · `cortex verify` · `cortex moc` · `cortex doc` · minimal `md2typ` converter · optional config keys (`mocDir`, `dupeThreshold`, `outDir`) with defaults · README/CLAUDE · `outDir` added to `.gitignore`.

**Out (later):** AI-assisted merge execution for `dupes` (stays a suggestion → `/atomize`) · multi-topic / whole-vault `doc` books · tables/images/footnotes in `md2typ` · semantic (vector) dupe detection · `verify` against an external rule catalog · a `/cortex-*` skill front-end per command (the CLI is the surface for now; skills can wrap later).

## 11. Testing

TDD against temp vaults, mirroring `test/promote.test.ts`:

- **gaps:** unatomized sources (source file with no citing note) detected; a note citing it removes it; stale source flagged when mtime > snapshot; `note.source==null` listed except MOCs/`mocDir`; drafts listed.
- **dupes:** two near-identical notes score ≥ threshold and pair; unrelated notes don't; threshold respected; self-pairs excluded; deterministic order.
- **verify:** BFS to `hops`; `exists`/`cited`/`verified` flags correct; `ok` false when a target is a gap; dedupes revisited nodes.
- **moc:** selection union (tag/type/folder); grouping + sorted wikilinks; dry-run writes nothing; `--write` backs up an existing MOC then writes; `undo` restores; never writes under `sourcesDir`.
- **md2typ:** headings shift, bullets, bold/italic, wikilink→bold, text escaping.
- **doc:** plan selects topic notes; follows an existing MOC's order when present; `renderDocTyp` emits a valid `#import` + `doc.with` + sections; `--pdf` path is a no-op-safe branch when `typst` absent (asserted via a stubbed runner). Manual smoke: real `typst compile` on a sample topic.
- Full suite stays green; `npm run build` + `tsc --noEmit` clean.

## 12. File structure (planned)

```
toolkit/
├── src/curate/
│   ├── gaps.ts        — computeGaps (new)
│   ├── dupes.ts       — computeDupes + cosine (new)
│   ├── verify.ts      — verifyNote BFS (new)
│   ├── moc.ts         — planMoc / applyMoc (new)
│   ├── doc.ts         — planDoc / renderDocTyp (new)
│   └── md2typ.ts      — mdToTyp converter (new)
├── src/commands/
│   ├── gaps.ts · dupes.ts · verify.ts · moc.ts · doc.ts   — run*/format* (new)
├── src/config.ts      — mocDir / dupeThreshold / outDir defaults (modify)
├── src/cli.ts         — gaps · dupes · verify · moc · doc cases + usage (modify)
└── test/
    ├── gaps.test.ts · dupes.test.ts · verify.test.ts · moc.test.ts · doc.test.ts · md2typ.test.ts (new)
.gitignore             — add .cortex/out/ (modify)
```

Docs: README (`What it does today` + CLI verbs + roadmap `Phase 5 ✓`) and CLAUDE (toolkit row → `Phases 0–5`, new verbs), per the README-on-every-push convention.

## 13. Build order (two waves, one milestone)

1. **Wave 1 — diagnostics:** `gaps` → `dupes` → `verify` (+ config defaults they need). Read-only, no reversibility surface; lands coverage value fast.
2. **Wave 2 — producers:** `md2typ` → `moc` → `doc`. Writers/outputs on the green Wave-1 base; reuse backup/undo for `moc`, the Typst engine for `doc`.

Each wave ends green (`vitest` + `npm run build`) before the next.
