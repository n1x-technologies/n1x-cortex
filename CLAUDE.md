# CLAUDE.md — N1X Cortex repository

Claude Code reads this file automatically when you open the repo. It tells you what this repository is and how to work with it, so you don't need any further explanation.

## What this repository is

This is **N1X Cortex**, owned by **N1X Technologies** — an open-source **product**: the Cortex **engine + AI agent** that turns any markdown vault into a cited, AI-queryable knowledge graph, for humans and for AI agents. It ships as a CLI, a local web viewer, and an MCP server. The thing you actually run lives in `toolkit/`.

It is generic and reusable, NOT a client's vault, and contains **no client data**.

> **Brand note:** the product used to be called **BRAIN**; since v2.0 its name is **N1X Cortex** and the attribution is **N1X Technologies**. Always use the current name.

Where to start: the engine and its commands are in `toolkit/`; design specs and implementation plans are in `docs/design/`.

## File inventory

| File | What it is |
|---|---|
| `toolkit/` | **The Cortex engine + agent** (Node/TS), published to npm as `@n1x-technologies/cortex` (binary `cortex`): reads any markdown vault into a note graph; CLI `init`/`status`/`orphans`/`viz`/`query`/`atomize`/`promote`/`set-status`/`undo`/`hook`/`pause`/`resume` · `gaps` · `dupes` · `merge` · `verify` · `moc` · `doc` · `embed` · `mcp`. `atomize` is **dry-run by default**: it creates `status: draft` notes in `_inbox/`, merges AI-distilled updates into existing notes in place, and `promote` graduates status-advanced drafts out of `_inbox/` into curated folders. Every write is reversible (`.cortex/backups/` + `.cortex/promotions/`, `cortex undo`); `Markdown/` sources are never modified. AI distillation runs through `toolkit/skills/atomize/` (the `/atomize` skill). Claude Code lifecycle hooks keep the vault indexed on SessionStart; at Stop, **autonomy is configurable** — `suggest` nudges to run `/atomize`, while `auto-draft`/`full` spawn a headless `/atomize` run in the **background** (drafts to `_inbox/`; `full` also promotes), guarded by an anti-recursion flag + single-flight lock + cooldown + per-session cap, every write reversible. Gated by `cortex pause`/`autonomy: off`. The curation layer is read-only diagnostics (gaps/dupes/verify) and producers (`merge` folds a near-duplicate pair into one note and redirects inbound links via the `/dupes-merge` skill, reversible; `moc` writes a reversible Map-of-Content note; `doc` consolidates a topic's notes into a branded Typst PDF via `templates/typst/`). The semantic layer — `cortex embed` builds a local, on-device embedding store (transformers.js) under `.cortex/embeddings/`, and `query`/`dupes` run hybrid lexical+semantic retrieval (RRF) that degrades to TF-IDF when the store is absent (`query --json` and the `/query` skill expose this cited retrieval to other agents/tools); `@xenova/transformers` is an **optional peer** so the base install is light. The agent layer — `cortex mcp` runs a stdio Model Context Protocol server with two tools (`cortex_query` cited hybrid query, `cortex_get_note` full note); the long-running server keeps the embedding model warm. No vault content leaves the machine. The read half of the agent loop; write/curate over MCP is a planned follow-up. |
| `docs/design/` | Design specs (`specs/`) and implementation plans (`plans/`) for the toolkit. |
| `templates/` | `typst/` (branded PDF templates used by `cortex doc`) and `collaboration/` (git onboarding). |
| `CLAUDE.md` | This file. |
| `README.md` | Entry point for humans. |

## Rules for working in this repo

> **📝 Convention: the README is updated on every push.** Before any `git push`, review and update `README.md` so it reflects the current state (new commands, decisions, structure). An outdated README is a bug.

1. **Fixed attribution:** deliverables carry the **N1X Technologies** attribution with the current year's ©. No personal names, no contact email.
2. **🔒 Confidentiality — hard rule:** this repo is **generic and public**. **NEVER** include data from any client or real project: company names, real metrics, real note IDs, proprietary flow or product names, specific entities. If asked to incorporate a real case, anonymize it completely or refuse.
3. **Own brand palette:** N1X Cortex uses its own palette — navy `1A1A2E` / coral `E94560`. Don't mix it with any client project's palette.
4. **Releases:** the package is published by pushing a `vX.Y.Z` git tag, which triggers `.github/workflows/release.yml` (test → build → publish via the `NPM_TOKEN` secret). Bump `toolkit/package.json` version in the PR that precedes the tag.

## Collaboration (branch → PR) — read this before you start working here

This repo follows the N1X Cortex collaboration standard (the human-facing detail is in `CONTRIBUTING.md`). If you're working here with Claude Code:

1. **Onboarding (once per clone).** If `git config user.email` isn't a `@users.noreply.github.com` address, run `bash templates/collaboration/setup.sh`. It detects the user with `gh` and configures their git identity (their account's noreply email), the `commit.template`, and the hook that blocks direct pushes to `main`. It's idempotent.
2. **Never commit or push directly to `main`.** Every change comes in through: `git switch -c type/desc` → commit → `git push -u origin type/desc` → `gh pr create --fill` → the other person reviews → `gh pr merge --squash --delete-branch`.
3. **Co-authorship only when the work was genuinely done by two people** — not just because you're on the same team. The natural path without pairing: accept *suggestions* in review (GitHub adds the co-author automatically). The `.gitmessage` ships with the lines ready to uncomment when they apply.
