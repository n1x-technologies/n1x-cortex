---
title: "N1X Cortex Toolkit — Design"
date: "2026-06-25"
status: draft
author: "N1X Technologies"
type: design-spec
---

# N1X Cortex Toolkit — Design

Turn the N1X Cortex **methodology** (today: a markdown document + templates) into a
**working tool**: an open-source, local, single-user system that — inside Claude Code,
on any project — atomizes sources into a connected note graph, lets you query it with
cited answers, and shows it in a live local viewer.

## 1. Context & positioning

There are two distinct N1X things; this spec is about the second:

- **N1X Brain** — the **commercial product**. A multi-tenant platform that sits on top
  of a company's systems (live connectors, ingestion pipeline, web portal with auth,
  graph viewer, mechanical retrieval). Org-oriented.
- **N1X Cortex** — this repo. Meant to be a **generic, lightweight, personal tool** that
  anyone can drop into any project, **without** Brain's heavy machinery (no connectors,
  no multi-tenant, no hosted portal).

**Strategic intent — open-core funnel.** Cortex is open source on purpose: the free,
universal "taste of the N1X magic" that anyone running any project can feel locally,
which builds reputation and funnels toward the paid Brain product.

**The open-core boundary (must hold):**
- Free / Cortex line: local, single-user, your own files, no live integrations.
- Paid / Brain line: live connectors, multi-tenant, org memory, hosted portal.
- Cortex hints at Brain; it must never cannibalize it. Do **not** add connectors or
  multi-tenant to Cortex.

**The "wow" loop Cortex optimizes for:** point it at any project →
**atomize → connect → see the graph → ask with citations**. Fast, local, shareable.

Brain is used here only as a reference for **proven patterns** (mechanical retrieval
beats embeddings even in the product; typed graph; citation-first; a local web viz
server), never as an integration target.

## 2. Goals & non-goals

**Goals**
- Generic & locale-agnostic: works on any vault, any language, any (or no) schema.
- Local & dependency-light: one-command install, no auth, no network, no cloud.
- The full methodology cycle as tooling: atomize, connect, curate, query, visualize.
- Trust DNA: mechanical retrieval, mandatory citations, no hallucination, draft barrier.
- Native in Claude Code (skill + slash commands + optional hooks) **and** a standalone CLI.

**Non-goals**
- No live source connectors (Gmail/Drive/Teams) — that is Brain's moat.
- No multi-tenant, no auth, no hosted service.
- No semantic/vector search in v1 (see §6 — the wikilink graph is the curated semantic index).
- Not an Obsidian plugin; Obsidian-**compatible** (wikilinks) but not Obsidian-**dependent**.

## 3. Design grounding

The design is fitted to **real vaults**, not a toy: hundreds of atomic notes, thousands
of wikilinks, a meaningful fraction of links pointing at notes that do not exist yet
(liberal/"future" linking), rich and **localized** frontmatter (type/status fields and
folder names in the project's own language), and MOCs maintained by hand (no Dataview).
Three consequences drive the architecture:

1. The engine must read frontmatter **generically** — never hardcode English field names
   or a fixed schema. This is what makes it universal.
2. **Dangling-link targets are a first-class view** ("what to atomize next") — something
   Obsidian's native graph does not surface well.
3. The autonomy **draft barrier** maps directly onto the vault's own status field:
   auto-generated notes land at the first non-immutable status; a human promotes them.

## 4. Architecture

**Principle 1 — the `.md` is the only source of truth.** Everything else (index, in-memory
graph, the viewer's data) is **derived and disposable**, rebuildable from the `.md` at any
time. No parallel state that can desync.

**Principle 2 — schema- and locale-agnostic.** The engine *discovers* a vault's conventions
(folder names, the type field, the status field and its values) instead of imposing them.
An optional `.cortex.json` pins them; absent, they are inferred.

**Components (the complete system):**

1. **Engine (core)** — reads the vault's `.md` (read-only for indexing), parses frontmatter
   + wikilinks, builds an in-memory graph + a derived full-text index.
2. **CLI** (`cortex <cmd>`) — the engine's commands, runnable standalone.
3. **Viewer** — a local HTTP server + web UI (graph + search + coverage/orphans views),
   launched like claude-mem (`cortex viz` → opens a browser tab on a port).
4. **Claude Code layer** — a skill + slash commands wrapping the engine so it's native
   in Claude Code, plus lifecycle hooks for autonomy.
5. **Config** — `.cortex.json` (conventions + autonomy level); optional, inferred if absent.

**Data flow:** sources (`Markdown/`) → *atomize* (assisted or auto) → atomic notes (`.md`,
the truth) → engine indexes → consumed by the CLI, the viewer, and the Claude Code commands.
All local, single-user, no network.

**Runtime: Node / TypeScript** — frictionless `npx`-style install (key for universal open
source) and a native web viewer. (Python would reuse Brain's patterns but needs a venv →
more friction.) A model-provider seam exists for the standalone CLI (Anthropic / OpenRouter
/ Ollama), but the default runtime is "Claude Code is the model" (see §5).

## 5. Ontology & note model

The engine **discovers** the ontology rather than imposing it.

**Universal note model** extracted from each `.md`:

| Field | Source in a note | Used for |
|---|---|---|
| `path` | the file path | the **citable anchor** |
| `id` | frontmatter `id` (fallback: filename) | stable identity |
| `title` | first `# H1` (fallback: filename) | node label |
| `type` | the configured type field value | graph color / filter |
| `status` | the configured status field value | draft barrier + coverage |
| `tags` | `tags` | filter |
| `meta` | **all remaining frontmatter** | filter without hardcoding |
| `folder` | containing folder | secondary classification |
| `links[]` | wikilinks `[[..]]` + the heading they sit under | graph edges |
| `source` | the source field + the bottom citation line | the citations in `/query` |
| `sections{}` | recognized headings (e.g. an implementation checklist) | code-gen context |
| `body` | prose | full-text search |

**Edges & gaps.** A wikilink `A → B` is an edge. If `B` does not exist, it is a **dangling
edge = stub node (gap)** — a first-class view ("what to atomize next"). Edges are **untyped**
by default (matching real vaults), but the engine records each link's heading context so the
viewer can style "related" links vs inline mentions. (No typed edges — Cortex stays simple.)

**Ontology by discovery.** The engine scans notes, collects the distinct `type` and `status`
values actually present — that *is* the ontology. New values appear automatically. Config only
pins display order/colors/labels.

**Status lifecycle (the draft barrier, configurable).** An ordered list of stages, inferred
or pinned, e.g. `immutable (sources) → draft → documented → verified`. Auto-atomization writes
new notes at the first non-immutable stage; the human promotes them.

**Config — `.cortex.json` (all optional, inferred if absent):**

```json
{
  "vaultRoot": "cortex",
  "sourcesDir": "Markdown",
  "lang": "es",
  "fields":  { "type": "tipo", "status": "estado", "id": "id", "source": "fuente" },
  "statusLifecycle": ["draft", "documented", "verified"],
  "immutableStatus": "immutable",
  "autonomy": "auto-draft",
  "viz": { "port": 4317 }
}
```

A vault with no config still works (the engine infers field names and conventions). The file
is for tuning, not a requirement.

### 5.1 Localization (the `lang` model)

Three distinct layers of language — do not conflate them:

| Layer | What | Language |
|---|---|---|
| Vault content | the notes: titles, bodies, knowledge | **the project's / source's** (declared) |
| Vault conventions | folder names, type/status values | **consistent within a vault** (engine is agnostic) |
| The tool (product) | CLI, command names, viewer chrome, code, docs | **English** (universal open source) |

**Recommendation:** the tool itself stays English; the **content the atomizer generates**
follows a declared `lang` (default: inferred from the sources / existing notes). Same
convention as the existing Typst template (`lang: "en" | "es"`), so vault and generated PDFs
align. Set at init (`/cortex-init --lang es`); the extract step is told "write notes in {lang}".

**Why not all-English content:** translating a source to store it **breaks fidelity** — the
stored note no longer matches its cited source, violating "fidelity over completeness / cite
exactly." Knowledge stays in its source language; the tool that manages it is universal.

## 6. Atomization engine

The most novel/risky piece. Trust comes from: **mechanical steps are deterministic; the model
intervenes in exactly one step (extract); anything unverified stays `draft`.**

**Pipeline (mechanical vs model):**

1. **Select** (mechanical) — point at a source.
2. **Segment** (mechanical) — split by headings / boundaries into candidate units.
3. **Extract** (**model**) — per unit: one atomic note (title = one idea, type, body,
   citation, candidate wikilinks).
4. **Reconcile** (mechanical + fuzzy) — does a note for this already exist? Match by
   id/title/alias → propose **update**, not duplicate.
5. **Link** (mechanical + model) — resolve wikilinks; create dangling links liberally.
6. **Write** (mechanical) — `.md` into the right folder, frontmatter filled, status = first
   non-immutable stage, citation at the bottom.
7. **Index** (mechanical) — incremental reindex → viewer/query stay current.

**Inside Claude Code, Claude IS the model** — step 3 is a prompt the skill runs inline (no API
key, no separate model call). The viewer and `/query` use no model at all (mechanical retrieval).
Only atomization needs the model, and in Claude Code that is native. (The standalone CLI has the
optional provider seam.)

**Two invocation modes (= the autonomy levels):**
- **Assisted — `/atomize <source>`** (built first; the validated loop): runs the pipeline,
  shows a **preview/diff**, you approve, then it writes.
- **Automatic (`auto-draft`)** (built later, on a proven pipeline): hooks trigger it; it writes
  `draft` notes for later review.

**Quality guards (trust DNA, made mechanical):**
- Dry-run + diff always (never a black box).
- Citation mandatory — a note with no source is not finalized (stays `draft`, flagged).
- Atomicity guard — a note covering 2+ independently-changing ideas is flagged to split.
- No duplicates — fuzzy reconciliation proposes merge/update instead of a copy.
- Idempotent — re-atomizing the same source does not duplicate.
- Template-driven — reads the vault's `_templates/` so generated notes match house style.

### Search / retrieval — structured + full-text (no embeddings in v1)

The query layer is **structured filters + full-text**, not semantic. Rationale: in Cortex the
**wikilink graph + MOCs + tags are the curated, citable semantic index** — exactly what
embeddings approximate, but hand-built and traceable. Even Brain uses mechanical retrieval, not
vectors. Structured+FTS is local, deterministic, citable, dependency-light. The query interface
is designed so a semantic layer could be added later behind it without rework. Where a query
misses, the fix is "add a wikilink" (improves the graph permanently) rather than a fuzzy patch.

**`/query` retrieval (5 steps; only step 4 uses the model):**
1. **Anchor** (mechanical) — match the question against MOCs, type, tags, id, and FTS → anchor notes.
2. **Traverse** (mechanical) — walk wikilinks N hops, forward **and reverse**, gathering the subgraph.
3. **Select** (mechanical) — rank by FTS score + link proximity. No model decides what to read.
4. **Draft** (model) — write the answer, instructed to cite each claim with the note path,
   separate facts from `Inference:`, state what is `Missing:`, end with `Confidence:`.
5. **Cite** — every claim → note path; the note's source field chains to the original source.
   Two-level traceability: answer → note → source.

## 7. Command surface

Every command has both a slash command (Claude Code) and a CLI equivalent (`cortex <cmd>`).
Hot-path names are short (`/atomize`, `/query`, `/viz`); the rest are `/cortex-*` for
discoverability. Names are easily renamable.

**Setup:** `/cortex-init [--lang es]` — create `.cortex.json`, infer conventions, scaffold
structure/template if missing. Idempotent.

**Killer loop:** `/atomize <source>` (assisted pipeline) · `/query <question>` (mechanical →
cited answer) · `/viz` (launch the local viewer).

**Curation:** `/cortex-moc <topic>` (regenerate a MOC — replaces manual Dataview) ·
`/cortex-orphans` (dangling links / what to atomize next) · `/cortex-dupes` (near-duplicates →
merge) · `/cortex-gaps` (coverage: unatomized sources, notes missing citations, stuck drafts) ·
`/promote <note>` (advance status).

**Advanced outputs:** `/cortex-verify <flow>` (compliance checklist by walking a flow's links to
its rules) · `/cortex-doc <topic>` (consolidate notes → PDF via the Typst template).

**Maintenance:** `/cortex-status` (terminal dashboard) · `/cortex-validate` (structural lint) ·
`/cortex-reindex` (rebuild the derived index; usually automatic).

## 8. Autonomy & hooks

Built **last**, on the proven assisted loop. The hooks bring **no new logic** — they are thin
triggers around the same atomization engine (§6). That is the payoff of designing the whole
system up front.

**Four levels (`autonomy` in config, per vault):**
- `off` — no hooks act.
- `suggest` — hooks **detect** opportunities and surface a suggestion; never write.
- `auto-draft` (default) — detect **and write** `draft` notes at safe checkpoints, with a
  reviewable/undoable summary.
- `full` — may also update beyond draft; opt-in, higher risk.

**Hook map (Claude Code lifecycle):**

| Hook | What Cortex does | Writes? |
|---|---|---|
| SessionStart | incremental reindex if `.md` changed; inject a one-line vault status | no (read) |
| UserPromptSubmit | *(optional)* if the prompt looks like a domain question, inject relevant notes so the answer is grounded | no (read) |
| PostToolUse | watcher: mark sources/notes dirty for reindex (no atomization here — too frequent) | no (track) |
| Stop (end of turn) | the **checkpoint**: if sources changed and `autonomy ≥ auto-draft`, atomize the dirty sources, write `draft`, report one line | yes (draft only) |
| SessionEnd | final reconcile + optional session digest | minimal |

**Guards (so it never silently pollutes the graph):**
- Draft barrier always — auto-written notes are `draft`; nothing auto-promotes.
- Debounce + batch — only at the checkpoint, only on changed sources; bounded cost.
- Undo + journal — every auto-write is recorded; `/cortex-undo` reverts the last batch; git is
  the final backstop.
- Incremental & idempotent — never re-atomize unchanged sources.
- Quiet by default — one-line summaries; detail on demand.
- Scoped — acts only within `vaultRoot`/`sourcesDir`.
- Kill switch — `autonomy: off` or `/cortex-pause`.
- Cost cap — per-session token budget; on exceed, fall back to `suggest`.

## 9. The viewer

The "hero" piece — a local server + web UI you watch in another window (claude-mem style).

**How it runs:** `/viz` (or `cortex viz`) starts a local HTTP server on a configurable port,
opens a browser tab, and stays running for the session (`--stop` to stop). It serves a static
web app + a small JSON API over the derived index. `.md` is truth; the server **watches the
files and hot-reloads** so the graph updates live as the atomizer writes drafts. Read-only,
localhost only, no auth, no network.

**Graph view:** nodes = notes, edges = wikilinks; dangling targets render as faded/dashed
**ghost nodes** (the gaps Obsidian hides). Force-directed layout, optional clustering by
folder. Click a node → detail panel (frontmatter, the source citation, in/out links, body
preview, "open in editor").

**Coloring — "color by" toggle (decided).** One switch recolors the whole graph by **Type /
Status / Freshness** (like Obsidian groups). The **Freshness** mode is the "needs attention"
language (GitHub-style): green = verified & in sync · amber = draft, needs review · orange =
stale (source changed, not re-atomized) · gray = untouched · dashed ghost = gap. This makes the
attention view first-class without giving up the type view. (Revisit after using it live.)

**Search / filter:** full-text over bodies + structured filters (type, status, tag, any meta
field, folder, has-citation, is-orphan). Matches highlight in the graph.

**Cortex-only views (the value-add over Obsidian):** a **coverage dashboard** (% atomized per
source, notes by status, drafts pending, notes missing citations); a **gaps/orphans view**
(dangling targets ranked by inbound references = atomize-next priority); a **local graph**
(one note + N hops).

**Tech:** Node/TS minimal HTTP server, static assets (no build step); graph rendering via
**sigma.js** (WebGL, scales to thousands of nodes) — Cytoscape.js as an alternative.

## 10. Build order (the complete system, in vertical slices)

Design the whole (§4–§9); build loop-first so nothing is poured on unproven foundations. A
real existing vault means slice 1 already shows a rich graph, not an empty one.

| Phase | Scope | Why this order |
|---|---|---|
| **0 · Engine + read-only** | core (parse fm+wikilinks, graph+FTS index, schema-agnostic), `/cortex-init`, `/cortex-status`, `/cortex-orphans` | validate the engine on a real vault without writing anything |
| **1 · Viewer (toggle)** | local server + web (graph w/ color-by toggle, search, coverage/orphans/local-graph) | instant "wow" on a real vault; read-only |
| **2 · Query + citations** | `/query` mechanical retrieval + cited draft | the trust core, on a proven index |
| **3 · Assisted atomization** | `/atomize` (preview+diff+approve), reconcile, template-driven, writes `draft` | the validated loop before any automation |
| **4 · Autonomy (hooks)** | `auto-draft` via lifecycle hooks + all guards | the riskiest piece, last, on a proven pipeline |
| **5 · Curation + outputs** | `/cortex-moc`, `/cortex-dupes`, `/cortex-gaps`, `/promote`, `/cortex-verify`, `/cortex-doc` (Typst) | incremental value on a solid base |

**Packaging:** a Claude Code plugin (skill + commands + hooks) installable in one command (like
claude-mem), with a standalone CLI. Open source, Node/TS, local.

## 11. Key decisions (resolved)

- **Viewer:** custom local web viewer (claude-mem style), **not** Obsidian-dependent.
- **Coloring:** "color by" toggle (Type / Status / Freshness); Freshness = the GitHub-style
  attention view. (Default mode TBD after live use.)
- **Autonomy:** configurable per vault; **default `auto-draft`** (writes, but everything
  unverified stays `draft`).
- **Search:** structured + full-text in v1; semantic layer deferred behind the same interface.
- **Runtime:** Node / TypeScript.
- **Language:** the tool is English; vault **content** follows a declared/inferred `lang`.
- **Boundary:** no connectors, no multi-tenant — those stay in Brain.

## 12. Open questions (for the implementation plan)

- Exact `.cortex.json` inference rules (how to detect the type/status fields when unconfigured).
- Index store: SQLite FTS5 vs an in-memory index for v1 (both are derived/disposable).
- Default Freshness-vs-Type coloring mode after live testing.
- How `/cortex-doc` maps note sets onto the existing Typst template sections.
- Plugin distribution channel (marketplace vs `npx` installer) and how it co-publishes via the
  existing `sync/` mechanism, if at all.
