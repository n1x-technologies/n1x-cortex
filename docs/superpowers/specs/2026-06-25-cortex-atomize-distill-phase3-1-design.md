# Cortex Atomize 3.1 — AI-distilled notes (design)

> **Status:** approved design, pending implementation plan.
> **Builds on:** Phase 3 (`cortex atomize`, mechanical write-side) — shipped on `main` (PR #14).
> **Branch:** `feat/cortex-atomize-distill-phase3-1`.

## 1. Goal

Turn the mechanical `cortex atomize` into an **AI-distilled** one. In Phase 3 each source segment was copied verbatim into a `status: draft` note. In 3.1, **Claude rewrites each segment into a proper atomic note** — distilling the body, inferring the `type`, **splitting** a non-atomic segment into multiple notes, **routing** each note to a folder, and adding `tags` and `[[wikilinks]]` — while every write-safety guarantee from Phase 3 stays intact and enforced in tested toolkit code.

This realizes the methodology's **Pillar 1 (Atomize)** + **Pillar 4 (AI layer)**: the deterministic engine provides the seams; the AI fills them.

## 2. Architecture

The toolkit remains the deterministic, dependency-light, tested write-engine — **no LLM dependency**. A new Claude Code **`/atomize` skill** is the AI layer. They communicate through **two JSON seams** added to the existing `cortex atomize` command. Claude only ever produces *data*; every file that hits disk goes through the toolkit's tested safety path.

```
cortex atomize src.md --emit-json   →  plan.json      (segments + vault context)
        ↓   /atomize skill: Claude distills each segment
   distilled.json   (notes: title, type, folder, tags, body)
        ↓
cortex atomize --apply distilled.json [--write]  →  _inbox/<folder>/<id>.md
                                                    ▲ reconcile · render · citation · confinement
                                                      — all enforced in tested code
```

**Why this split:** write safety was the headline of Phase 3 (dry-run default, draft barrier, no-dupes, `_inbox/` confinement, escaped citation, sources never touched), all enforced by tests. Keeping every write in the toolkit means adding intelligence cannot weaken those guarantees — the skill *cannot* skip a citation, write outside `_inbox/`, or create a duplicate, because it never writes files at all.

## 3. Component 1 — toolkit `--emit-json` (deterministic, TDD)

A new mode of the `atomize` command that prints the plan as machine-readable JSON instead of human text. Shape:

```jsonc
{
  "source": "rules",                       // basename of the source, no .md
  "sourcePath": "Markdown/rules.md",
  "lang": "es",                            // config.lang (or null)
  "fields": { "type": "tipo", "status": "estado", "id": "id", "source": "source" },
  "statusFirst": "borrador",               // config.statusLifecycle[0] — the draft barrier value
  "knownTypes":   ["concepto", "regla", "flujo"],        // DISCOVERED from the vault
  "knownFolders": ["01-Conceptos", "03-Reglamentos"],    // DISCOVERED from the vault
  "existing": [                            // current notes, for Claude's dup-awareness
    { "id": "limite-operacion", "title": "Límite de operación", "path": "03-Reglamentos/x.md", "type": "regla", "folder": "03-Reglamentos" }
  ],
  "segments": [                            // from segmentSource(), raw bodies
    { "heading": "Operation limit", "level": 2, "body": "The limit is 5. ..." }
  ]
}
```

**Discovery rules** (the type/folder grounding):
- `knownTypes` = unique non-null `type` values across `scanVault` notes.
- `knownFolders` = unique top-level `folder` names across `scanVault` notes, **excluding** `config.sourcesDir` (`Markdown/`) and `_inbox/`.
- `existing` is informational; the toolkit still re-reconciles authoritatively on `--apply`.

New function (testable): `emitPlan(vaultDir, sourcePath, config) → AtomizeEmitPlan` (a new type in `types.ts`).

## 4. Component 2 — toolkit `--apply <file>` (deterministic, TDD)

Reads Claude's `distilled.json` and runs each note through the **existing** Phase 3 machinery. Input shape Claude must produce:

```jsonc
{
  "source": "rules",
  "notes": [
    {
      "title": "Operation limit",          // required — id = slug(title)
      "type": "regla",                      // SHOULD be one of knownTypes
      "folder": "03-Reglamentos",           // routed target (one of knownFolders); null → _inbox/ root
      "tags": ["regla", "limite"],          // optional
      "body": "Distilled markdown body, may contain [[wikilinks]].",
      "fromHeading": "Operation limit"       // optional provenance
    }
  ]
}
```

Apply pipeline, per note:
1. Build `NoteSpec`: `id = slug(title)`, `status = statusLifecycle[0]`, `source` = the emitted source name, `type`, `folder`, `tags`, `body`.
2. **reconcile** against `scanVault` → `skip` duplicates (id or normalized-title match) — unchanged guarantee.
3. **render** (extended `renderNote`) — frontmatter (`id`, `type`, `status`, `tags` when present, escaped `source`) + `# Title` + body + the `*Source: [[…]]*` citation line.
4. Compute destPath = `_inbox/<folder>/<id>.md` (folder omitted → `_inbox/<id>.md`); apply the existing de-collision + `_inbox/` confinement guard (the guard now checks the `_inbox/` prefix, sub-paths allowed).
5. **dry-run by default**; only `--write` writes. Sources never read-modified.

New function (testable): `applyDistilled(vaultDir, specsPath, config, { dryRun }) → { plan, written }`, reusing `reconcile`/`renderNote`/the de-collision logic.

**Type extensions** (`types.ts`): `NoteSpec` gains `tags?: string[]`. `AtomizeEmitPlan` and `DistilledSpec`/`DistilledInput` added. `renderNote` emits `tags` and respects `folder` in the destPath; the frontmatter records the routed folder implicitly via path (no extra field needed) — a `folder` frontmatter hint is optional and **deferred** unless trivial.

## 5. Component 3 — the `/atomize` skill (`toolkit/skills/atomize/SKILL.md`)

A plain-English procedure Claude follows (the AI layer). Frontmatter `name: atomize`, a description that triggers on "atomize this doc" / `/atomize`. Body procedure:

1. Resolve the source path; run `cortex atomize <src> --emit-json`; parse it.
2. **Distill** each segment, following the methodology rules encoded in the skill:
   - **Atomic:** one idea per note. **Split** a segment into N notes when it covers two things that could change independently (Pillar 1 criterion).
   - **Type:** choose from `knownTypes`; only introduce a new type when none fits (and say so in the preview).
   - **Folder:** route from `knownFolders` (type→folder by the vault's convention).
   - **Cold-vault fallback:** when `knownTypes`/`knownFolders` are empty (a vault with no atomized notes yet), fall back to the methodology's canonical vocabulary — types `concept/flow/rule/technical/error/security/ux/mvp/strategy` and folders `01-Concepts/ … 09-Strategy/` (localized to the vault's `lang` when set) — and flag in the preview that a new taxonomy is being seeded.
   - **Body:** structured natural language; include an *Implications for implementation* section for flow/process notes.
   - **Connect:** add `[[wikilinks]]` to related sibling notes and known vault notes; dangling links are valid (Pillar 2).
   - **Tags + language:** add `tags`; write in the vault's language (`lang`).
3. Assemble `distilled.json`; run `cortex atomize --apply distilled.json` (dry-run); **show the batch plan** — titles, types, folders, split count, any skips/new-types.
4. On the user's "go," re-run with `--write`; report what landed in `_inbox/`.

The skill encodes the **one batch checkpoint** UX and the **staging** model (everything lands under `_inbox/<folder>/`).

## 6. Write-safety (unchanged — all enforced in tested toolkit code)

Dry-run by default · draft barrier (`statusLifecycle[0]`) · no-duplicates / idempotent (`reconcile`) · mandatory escaped `source` citation · `_inbox/` confinement (now `_inbox/<folder>/`, prefix-guarded) · sources and existing notes never modified · intra-batch slug de-collision.

## 7. Scope

**In scope (3.1):** distill body · infer `type` (vault-grounded) · split 1→N · folder routing (as `_inbox/` suggestion path) · `tags` · `[[wikilinks]]` · the `/atomize` skill · the two JSON seams.

**Out of scope (later phases):**
- `update` / merge into an existing note (3.2).
- route-in-place (write straight to curated folders) as opt-in config.
- auto-promotion out of `_inbox/`.
- a `folder:` frontmatter field (deferred unless trivial during render).

## 8. Testing

TDD on both deterministic toolkit seams, against temp vaults + a fixture `distilled.json`:
- `emitPlan`: correct segments; `knownTypes`/`knownFolders` discovered and exclude `Markdown/` + `_inbox/`; `statusFirst` = lifecycle[0]; `existing` populated.
- `applyDistilled`: dry-run writes nothing; `--write` writes to `_inbox/<folder>/<id>.md`; reconcile skips a known duplicate; citation present and escaped; `tags` rendered; sources unchanged; de-collision on same-slug notes; confinement holds (no write escapes `_inbox/`).
- Full suite stays green; `npm run build` clean.

The `SKILL.md` itself is prose (not unit-tested); it gets a **manual smoke** on a throwaway vault: `--emit-json` → hand-distill a small `distilled.json` → `--apply` dry-run (nothing written) → `--apply --write` (drafts appear under `_inbox/<folder>/`, sources untouched).

## 9. File structure (planned)

```
toolkit/
├── src/types.ts                 — add AtomizeEmitPlan, DistilledSpec/DistilledInput; NoteSpec.tags? (modify)
├── src/atomize/
│   ├── emit.ts                  — emitPlan(vaultDir, sourcePath, config)
│   ├── apply-distilled.ts       — applyDistilled(vaultDir, specsPath, config, {dryRun})
│   └── render.ts                — extend renderNote: tags + folder destPath (modify)
├── src/commands/atomize.ts      — --emit-json and --apply <file> modes (modify)
├── src/cli.ts                   — flag parsing for emit/apply (modify)
├── skills/atomize/SKILL.md      — the /atomize AI-distillation procedure (new)
└── test/
    ├── emit.test.ts
    └── apply-distilled.test.ts
```

Docs: README + CLAUDE updated for the `--emit-json`/`--apply` modes and the `/atomize` skill (per the repo's README-on-every-push convention).
