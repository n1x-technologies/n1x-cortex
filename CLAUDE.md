# CLAUDE.md — N1X Cortex repository

Claude Code reads this file automatically when you open the repo. It tells you what this repository is and how to work with it, so you don't need any further explanation.

## What this repository is

This is **N1X Cortex**, owned by **N1X Technologies** — an open-source **product**, not just a document. Two things live here, and they belong together:

- **The product** (`toolkit/`) — the Cortex **engine + AI agent** that turns any markdown vault into an AI-queryable knowledge graph (CLI, local web viewer, cited query, AI atomization). This is the thing you actually run.
- **The spec** (`N1X-Cortex-v2.md`) — the method behind the product, written up as a generic, reusable IP artifact. For this document, the **markdown is the source of truth** (the PDF is derived).

It is generic and reusable, NOT a client's vault, and contains **no client data**.

> **Brand note:** the product used to be called **BRAIN**; since v2.0 its name is **N1X Cortex** and the attribution is **N1X Technologies**. Only the current version lives in the tree; older ones are in git history.

Where to start, by intent:
- **To work on the product** → `toolkit/` and `docs/design/` (design specs + implementation plans).
- **To understand the conceptual model** → read the spec `N1X-Cortex-v2.md`.

## File inventory

| File | What it is |
|---|---|
| `N1X-Cortex-v2.md` | **The spec** — the method behind the product, in markdown (source of truth for this doc; the PDF is derived). |
| `N1X-Cortex-v2.typ` | Typst source of the current PDF — mirrors the `.md` with layout. |
| `N1X-Cortex-v2.pdf` | Compiled PDF — **git-ignored**, generated on demand (`typst compile`), not versioned. |
| `UPDATE-PROCESS.md` | **Operating procedure:** how to version, edit, and regenerate the PDF. Read it before changing anything. |
| `toolkit/` | **The Cortex engine + agent** (Node/TS): reads any markdown vault into a note graph; CLI `init`/`status`/`orphans`/`viz`/`query`/`atomize`. `atomize` is **dry-run by default**; it creates `status: draft` notes in `_inbox/` and (Phase 3.2) **merges AI-distilled updates into existing notes in place** — each edited note is backed up to `.cortex/backups/` first and is reversible with `atomize --undo`; `Markdown/` sources are never modified. AI distillation runs through `toolkit/skills/atomize/` (the `/atomize` skill). Phases 0–3.2. |
| `docs/design/` | Design spec (`specs/`) and implementation plans (`plans/`) for the toolkit. |
| `CLAUDE.md` | This file. |
| `README.md` | Entry point for humans. |

## What was done here (summary)

Two tracks: **(1)** the method — the **4 pillars** (Atomize · Connect · Curate · AI Layer) — was distilled into a structured 9-section spec with a Typst **PDF generation pipeline** (see Section 6 and the `PROCESO`); the spec stands on its own, independent of any project it's applied to. **(2)** the **product** was built in `toolkit/` — the Cortex engine + AI agent (Phases 0–3.1: engine, viewer, cited query, AI-distilled atomization) — turning the method into a working local tool.

## Rules for working in this repo

> **📝 N1X Cortex convention (applies to EVERY project): the README is updated on every push.** Before any `git push`, review and update the repo's `README.md` so it reflects the current state (new files, decisions, structure, schedule). An outdated README is a bug. This standard applies to this repo and to any project that uses the N1X Cortex methodology.

1. **Markdown is the source of truth.** The PDF is derived output — never hand-written. When the content changes: edit the `.md` first, then mirror it in the `.typ`, then recompile.
2. **Regenerate the PDF:** `typst compile N1X-Cortex-v{N}.typ N1X-Cortex-v{N}.pdf`. The full procedure (versioning vN→vN+1, checklist, common Typst errors) is in `UPDATE-PROCESS.md`.
3. **Versioning:** keep **only the latest** version in the tree; bump the version (`-v3`, `-v4`…) when you publish a new one and let **git history** preserve the old. Don't accumulate old files.
4. **Fixed attribution:** every deliverable carries the **N1X Technologies** attribution on the cover, footer, and final footer, with the current year's ©. No personal names, no contact email.
5. **🔒 Confidentiality — hard rule:** this document is **generic and public**. **NEVER** include data from any client or real project: company names, real metrics (note counts, lines, workshops), real note IDs, proprietary flow or product names, specific countries or entities. Section 8 ("Application case") must stay **hypothetical and illustrative**. If you're asked to incorporate a real case, anonymize it completely or refuse.
6. **Own brand palette:** N1X Cortex deliverables use their own palette (navy `1A1A2E` / coral `E94560`). Don't mix it with any client project's palette.

## Collaboration (branch → PR) — read this before you start working here

This repo follows the N1X Cortex collaboration standard (the human-facing detail is in `CONTRIBUTING.md`). If you're working here with Claude Code:

1. **Onboarding (once per clone).** If `git config user.email` isn't a `@users.noreply.github.com` address, run `bash templates/collaboration/setup.sh`. It detects the user with `gh` and configures their git identity (their account's noreply email, so their commits are attributed to them), the `commit.template`, and the hook that blocks direct pushes to `main`. It's idempotent.
2. **Never commit or push directly to `main`.** Every change comes in through: `git switch -c type/desc` → commit → `git push -u origin type/desc` → `gh pr create --fill` → the other person reviews → `gh pr merge --squash --delete-branch`.
3. **Co-authorship only when the work was genuinely done by two people** — not just because you're on the same team. The natural path without pairing: accept *suggestions* in review (GitHub adds the co-author automatically). The `.gitmessage` ships with the lines ready to uncomment when they apply.

## If you're asked to apply the methodology to a new project

This repo **describes** the methodology but isn't an operational vault. To build an N1X Cortex vault in a new project, follow the generic structure in **Section 4** of the document (folders `00-MOC/` … `09-Strategy/`, standard frontmatter, wikilinks) and the principles in **Section 7**. The project's vault lives in that project's repo, **never here**.
