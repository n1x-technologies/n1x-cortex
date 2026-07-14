# Changelog

All notable changes to **N1X Cortex** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
