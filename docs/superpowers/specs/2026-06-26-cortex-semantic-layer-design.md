# Cortex Phase 6 — Semantic Layer: local embeddings for `query` + `dupes` — design

> **Status:** approved direction, pending implementation plan.
> **Builds on:** Phases 0–5 — shipped on `main`. Reuses the engine (`scanVault`, `buildIndex`/`searchIndex`), the TF-IDF cosine in `computeDupes`, the `query` retrieve/excerpt pipeline, and the `loadConfig` defaults pattern. Sources under `sourcesDir` are never modified.
> **Branch:** `feat/cortex-semantic-layer-phase6`.
> **Scope note:** This is the first slice of the "Phase 6" backlog (the deferred semantic layer). The other backlog items (hook auto-write, AI dupe-merge, hardening, md2typ/doc extensions, per-command skills) are out of scope here and each get their own spec → plan → implementation cycle.

## 1. Goal

Today `query` and `dupes` are **lexical**: TF-IDF over exact tokens (`src/search/index.ts`, `src/curate/dupes.ts`). They are blind to meaning — synonyms, paraphrase, and especially **cross-language** matches (an ES note and its EN equivalent share no tokens → cosine ≈ 0). This is the single biggest quality gap for a bilingual ES/EN vault.

Phase 6 adds a **semantic layer**: a local, on-device embedding model produces a dense vector per note that encodes *meaning*, not words. The same piece feeds **both** commands:

- **`query` (vector search):** find notes by idea, not just shared vocabulary.
- **`dupes` (semantic dedupe):** surface conceptual duplicates — paraphrases, translations, the same idea worded differently — that TF-IDF cannot see.

The embedding producer is the only new concept; it sits **behind a clean interface** so `query`/`dupes` never know about the model. This is exactly the "deferred behind the same interface" intent from the Phase 6 backlog.

## 2. Design principles

- **Local-first, private by default.** Embeddings run on-device (transformers.js). No vault content leaves the machine, no API key, no network at query time. Honors the repo confidentiality hard-rule.
- **Hybrid, never replace.** Semantic *augments* TF-IDF; the two rankings are fused. Lexical guarantees exact terms (proper names, case IDs, citations) are never lost; semantic adds meaning/paraphrase/cross-language.
- **Graceful degradation — semantic never breaks a command.** No embedding store, no model, or a stale store → fall back to current lexical behavior with a hint. `query`/`dupes` always return.
- **Derived cache, not a vault write.** Embeddings live in `.cortex/embeddings/` — an index-like artifact (git-ignored), keyed by content hash. No backup/undo machinery; `Markdown/` sources untouched.
- **Deterministic given a store.** Same vault + same store → same fused ranking. The model itself is the only non-deterministic dependency, and it is isolated behind the `Embedder` interface for testing.
- **Quiet, structured output** — mirror existing `query`/`dupes` formatting; annotate why a result/pair was surfaced.

## 3. Architecture

A new isolated module `src/semantic/`. `query` and `dupes` depend only on its interface, never on transformers.js.

```
src/semantic/
  embedder.ts   // Embedder interface + TransformersEmbedder impl (transformers.js)
  store.ts      // embedding cache in .cortex/embeddings/, hash + model invalidation
  fuse.ts       // Reciprocal Rank Fusion of lexical + semantic rankings
  cosine.ts     // shared cosine similarity (currently inline in dupes.ts)
```

### 3.1 The `Embedder` interface (the isolation boundary)

```ts
export interface Embedder {
  readonly id: string;    // e.g. "Xenova/multilingual-e5-small" — persisted for invalidation
  readonly dim: number;   // e.g. 384
  embed(texts: string[]): Promise<Float32Array[]>;
}
```

- **Impl:** `TransformersEmbedder` wraps the transformers.js `feature-extraction` pipeline.
- **Model:** a small **multilingual** model — default `Xenova/multilingual-e5-small` (384 dims). Multilingual is the point: it makes ES↔EN matching work, the core differentiator over TF-IDF.
- **Why an interface:** tests inject a deterministic stub `Embedder` (no network, no weights); only `TransformersEmbedder` carries the heavy dependency.

### 3.2 The embedding store (`src/semantic/store.ts`)

One record per note, persisted under `.cortex/embeddings/` (git-ignored, like `.cortex/out`):

```ts
interface EmbeddingRecord { path: string; hash: string; model: string; vector: number[]; }
```

- **Key & invalidation:** `(content hash, model id)`. If a note's content hash changed or the configured model changed, that note is recomputed; everything else is reused. This makes `cortex embed` a delta operation.
- **Layout:** a single `index.json` (records) is sufficient for v1's scale (a few thousand notes). The store is opaque to `query`/`dupes`, which only ask it for "the vector for note at path P, if fresh."
- It is a **derived artifact** — never a source write, so no backup/undo hooks.

### 3.3 Rank fusion (`src/semantic/fuse.ts`)

TF-IDF scores and semantic cosine live on **different scales** and are not directly comparable. Use **Reciprocal Rank Fusion (RRF)**, which combines by *rank position*, not raw value:

```
fusedScore(doc) = Σ_r  1 / (rrfK + rank_r(doc))
```

over each ranking `r` (lexical, semantic). `rrfK` defaults to `60` (the standard constant). RRF is scale-free and robust, avoiding fragile per-ranking normalization. A document missing from one ranking simply contributes nothing from that ranking.

## 4. The `cortex embed` command

Explicit, resumable setup step that builds/refreshes the store:

1. `scanVault(...)` (same engine call as every command).
2. Hash each note's content; diff against the store.
3. Re-embed **only the delta** — new or changed notes; drop deleted notes from the store.
4. Write the store to `.cortex/embeddings/`.

- **First run** downloads the model weights via transformers.js, cached under `.cortex/models/` (set `TRANSFORMERS_CACHE` so weights stay inside the repo, not the user's HOME).
- **Resumable by construction:** hash-keyed, so re-running after editing 3 notes re-embeds only those 3.
- **Flags:** `--force` (full rebuild), `--model <id>` (one-off override of `embedModel`).
- **Output:** progress (`embedded 12/250 …`) and a summary (`+N new, ~M changed, -K removed`).
- **Module split** (matches the repo convention): pure compute in `src/semantic/`, a `commands/embed.ts` wrapper (`runEmbed` + `formatEmbed`), a `cli.ts` case.

## 5. Wiring into `query` and `dupes`

### 5.1 `cortex query` (hybrid; semantic on by default when a store exists)

- Current TF-IDF `searchIndex` → **lexical ranking** (unchanged).
- If the store exists and is non-empty: embed **the query string** with the (already-downloaded) model, cosine vs. whatever fresh note vectors the store holds → **semantic ranking**. (Notes missing a fresh vector — never embedded or stale — simply don't appear in the semantic ranking; they still rank lexically. This is the same partial-degradation rule as §7.)
- **RRF fuses** the two → final ranking. The downstream retrieve/excerpt/citation pipeline is unchanged (it just consumes a reordered list).
- **Fallback:** no store, or model unavailable at query time → pure TF-IDF (current behavior) + a one-line hint: *"run `cortex embed` for semantic search."* Never errors.
- **Cost note:** semantic query loads the model to embed one short string (seconds on first call in a process). Acceptable; weights are already local from `cortex embed`.

### 5.2 `cortex dupes` (hybrid)

- Current TF-IDF cosine via inverted index → **lexical pairs** (unchanged).
- **Semantic** cosine over stored vectors → pairs TF-IDF cannot see (paraphrase, translation, reworded ideas) — the heart of the feature. Gated by `semanticDupeThreshold`.
- **Result:** the **union** of lexical and semantic pairs, each annotated with both scores so the report shows *why* a pair was flagged:

  ```
  a.md  ~  b.md   lexical 0.12  semantic 0.91   (semantic)
  c.md  ~  d.md   lexical 0.52  semantic 0.74   (both)
  ```
- All-pairs semantic cosine is O(n²) over dense 384-dim vectors — fine for v1 scale (a few thousand notes). Larger scale (ANN index) is explicitly deferred.

## 6. Config additions

Extends the `loadConfig` defaults (alongside `mocDir`/`dupeThreshold`/`outDir`); all optional, no `.cortex.json` change required:

```jsonc
{
  "embedModel": "Xenova/multilingual-e5-small",  // embedding model id
  "embedDir": ".cortex/embeddings",              // store location (git-ignored)
  "semanticDupeThreshold": 0.85,                  // cosine cutoff for semantic dupe pairs
  "rrfK": 60                                       // Reciprocal Rank Fusion constant
}
```

`.gitignore` adds `.cortex/embeddings/` and `.cortex/models/`.

## 7. Error handling / graceful degradation

Principle: **semantic never breaks a command.**

- **Model not downloaded / package failure** → catch, warn once, fall back to lexical-only.
- **Stale store** (N notes changed since last `embed`) → use vectors for still-fresh notes; warn that N are stale with a re-`embed` hint. Notes without a fresh vector contribute no semantic signal (they still rank lexically).
- **`cortex embed` with no network on first run** → clear, actionable error ("could not download model `<id>`").
- **Dimension/model mismatch** in the store vs. configured model → treated as invalidation: those records are stale and recomputed on next `embed`.

## 8. Testing

The `Embedder` interface makes everything but the real model testable with **no network and no weights**:

- **Unit, deterministic:** `store` (read/write + hash/model invalidation), `fuse` (RRF ordering), `cosine`.
- **Integration with a stub `Embedder`:** `query` and `dupes` over a fixture vault, injecting deterministic vectors (e.g. crafted so an ES note and its EN "translation" embed close) → asserts the fusion surfaces cross-language matches that TF-IDF alone misses.
- **Real `TransformersEmbedder`:** a single manual/integration smoke test (the only part needing the heavy dependency + first-run download); not in the default unit run.

## 9. Out of scope (deferred)

- **ANN / vector index** for large vaults — v1 is linear cosine; deferred behind the same store interface.
- **API-based embeddings** — explicitly rejected for v1 (confidentiality + local-first); the `Embedder` interface leaves room for an opt-in impl later.
- **AI-assisted dupe *merge*** — `dupes` still only *reports*; closing that loop is a separate Phase 6 backlog item.
- **Lazy auto-download** inside `query`/`dupes` — model acquisition stays the explicit `cortex embed` step.
