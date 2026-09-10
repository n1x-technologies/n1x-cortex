# Changelog

All notable changes to **N1X Cortex** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-10

### Changed
- **The embedding store is now two files, so a large vault can open at all.**
  Every vector used to live in `.cortex/embeddings/index.json` as decimal text,
  about 8 KB a note. Past roughly 65,000 notes that file is longer than the
  longest string V8 can build, and reading it threw `Invalid string length`: the
  vault did not get slow, it stopped opening. Vectors now go to `vectors.bin` as
  raw Float32 (1.5 KB a note) and `index.json` keeps only the path and content
  hash of each note. Measured at 70,000 notes: saved in ~150 ms, loaded in
  ~50 ms, where the previous format failed. Rankings are bit-for-bit identical —
  the values were already float32; the old format only wrote them as text. (#140)
- **Existing stores migrate by themselves.** A store written by 1.1.0 or earlier
  is still read as it was, and the next `cortex embed` rewrites it in the new
  layout, reusing every vector. Nothing to run by hand.
- **Going back to 1.1.0 or earlier needs `cortex embed --force` first.** Older
  versions do not know the new layout: they read `index.json`, find no vectors
  in it, and `cortex dupes` — and `cortex query`, when the semantic layer is
  installed — exit with `TypeError: Cannot read properties of undefined
  (reading 'length')`. A plain `cortex embed` on the older version makes it
  worse: it counts every note as reused and writes a store with no vectors at
  all. `cortex embed --force` rebuilds the store in the old layout. Upgrading
  to 1.2.0 again afterwards needs nothing.
- **For library consumers:** `EmbeddingRecord.vector` is now
  `Float32Array | number[]`, and loaded vectors are `Float32Array` views over one
  shared buffer. Code that serializes a vector with `JSON.stringify` must convert
  it with `Array.from()` first — a `Float32Array` serializes as an object keyed
  by index. `cosineDense` accepts any `ArrayLike<number>`. New:
  `loadStoreMeta()` (paths and hashes without reading the vectors) and
  `readStore()` (the store, or the reason it could not be trusted).

### Fixed
- **A store whose two files do not belong together is refused, not half-read.**
  With the store split in two, a copy or sync that carries one file and not the
  other, or a process killed between the two writes, could otherwise load
  silently wrong: a missing `vectors.bin` gave every note an empty vector — and
  the next `cortex embed` "reused" them and wrote zeros — while a `vectors.bin`
  from another save gave every note a neighbour's vector. `vectors.bin` now
  carries a header with a generation id that `index.json` also records, and its
  size must match exactly. A mismatched pair is treated as no store for queries,
  and `cortex embed` re-embeds every note and prints why. (#140)
- **`saveStore` refuses a vector whose length is not the store dimension**
  instead of padding it with zeros or cutting it.

## [1.1.0] - 2026-08-13

Everything here comes from one report by a consumer running Cortex as an npm
dependency against a ~1,500-note vault. Three of the defects produced the same
symptom — the calling application answering "I couldn't find this in the source"
while retrieval had worked correctly.

### Changed — read this before upgrading
- **`cortex query` now rejects unknown options instead of searching for them.**
  The old parser treated every token that was not `--json` as part of the
  question, so `cortex query "first crack" --limit 4` searched for
  `first crack --limit 4`: no error, just quietly worse retrieval. Any command
  line passing an unsupported flag today will now exit 1 with a usage message.
  A bare `--` ends option parsing, so a question that legitimately contains
  flag-looking words stays askable: `cortex query -- what does --force do`.
  `cortex embed` gained the same strictness, for the same reason. (#135)

### Fixed
- **Output was truncated when read through a pipe.** The CLI exited via
  `process.exit()`, which discards pending writes. On a TTY those writes are
  synchronous and nothing was lost; on a pipe they are asynchronous, so
  `cortex query --json | consumer` delivered JSON cut off mid-document.
  Measured: the old path emitted exactly 65,536 bytes of a 222,348-byte
  payload — the macOS pipe buffer to the byte. The CLI now drains stdout and
  stderr before exiting, and resolves rather than hanging if the reader closed
  the pipe first. (#135)
- **`cortex query` silently ignored any embedding store built against a remote
  endpoint**, comparing it to the locally configured model, and fell back to
  lexical-only retrieval with no error. (#135)
- **The embedding store could mix vectors from two different spaces.** It keys
  reuse on a single model id, and two backends can answer to the same model
  name with incomparable vectors. The id now carries the endpoint, so pointing
  `cortex embed` at a different server re-embeds instead of mixing. (#135)
- The "semantic support is not installed" error advised `npm i -g`, which does
  not help when Cortex is a project dependency. It now names the in-project
  install, the global one, and the remote endpoint that avoids the optional
  dependency entirely. (#135)

### Added
- **`cortex embed --base-url <url>`** embeds through any OpenAI-compatible
  `/embeddings` endpoint, matching what `cortex atomize` already accepted.
  Nothing is downloaded and the optional `@huggingface/transformers` peer is
  not needed — useful where a deployment cannot ship onnxruntime or fetch a
  model at runtime. Vectors are normalised to match the on-device backend,
  results are placed by the response's `index` rather than array position, and
  inputs are batched. `OPENAI_API_KEY` is sent only when set. (#135)
- **`cortex query --limit <n>`** — the hit count was hardcoded to 12 with no
  way to change it. (#135)
- **`cortex query --full` and `--max-content <n>`** add a `content` field
  carrying the note body. Previously each hit exposed only `excerpt`, capped at
  200 characters: feeding an 8,800-character note to a model meant handing it
  ~1% of the note. The field is absent unless asked for, so existing output is
  unchanged, and it is built after the limit is applied. (#135)

### Benchmark
- The public-corpus slice stopped excluding the hand-written half of the
  Kubernetes `reference` docs. 81% of that directory is autogenerated and
  stays out, but 218 of the corpus's other files link into it 812 times, and
  excluding all of it left holes — RBAC had no definition anywhere, and the
  glossary that supplies 24 files' definitions was absent. Now 584 documents,
  962,044 tokens. The fetch script also genuinely pins its commit now: it used
  to clone `main` and merely record the resulting sha. (#134)
- A 20-question contamination pilot measured 19 of 20 already answerable with
  no context at all, retiring that question-sourcing strategy before the full
  set was written. (#132, #133)

## [1.0.1] - 2026-07-13

### Security
- Migrated the optional semantic-layer dependency from the deprecated
  `@xenova/transformers` to its official successor `@huggingface/transformers`
  (v4). The old package pinned `onnxruntime-web` → `protobufjs@6.11.6`, which
  carried a critical + several high advisories with no downstream fix; the new
  runtime drops the vulnerable `protobufjs`. Embeddings are unchanged: the
  feature-extraction pipeline pins `dtype: 'q8'` to match the previous
  quantized default, so existing `.cortex/embeddings/` stores keep working with
  no re-embed required. (#83)
- Bumped `vitest` (dev dependency) to clear the remaining dev-only
  `esbuild`/`vite` advisories. `npm audit` is now clean. (#84)

### Notes
- `@huggingface/transformers` remains an **optional peer** — the base install
  stays light and unaffected.

## [1.0.0] - 2026-07-06

### Added
- First public release of N1X Cortex: the engine and AI agent that turns any
  markdown vault, or an undocumented repo, into a cited, AI-queryable knowledge
  graph.
- CLI: `init`, `new`, `status`, `orphans`, `viz`, `query`, `atomize`,
  `bootstrap`, `promote`, `set-status`, `undo`, `hook`, `pause`, `resume`,
  `gaps`, `dupes`, `merge`, `verify`, `moc`, `doc`, `embed`, `mcp`.
- Local web viewer for the knowledge graph (`cortex viz`).
- MCP server (`cortex mcp`) with always-on cited read tools, plus opt-in
  reversible write/curate scopes (`--write`, `--write=curate`).
- On-device semantic layer (`cortex embed`) with hybrid lexical + semantic
  retrieval (RRF) that degrades to TF-IDF when the store is absent.
- Reversible-by-design writes: `.cortex/` backups, `cortex undo`, and immutable
  `Markdown/` sources.

[1.0.1]: https://github.com/n1x-technologies/n1x-cortex/releases/tag/v1.0.1
[1.0.0]: https://github.com/n1x-technologies/n1x-cortex/releases/tag/v1.0.0
