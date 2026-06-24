# CLAUDE.md — N1X Cortex methodology repository

Claude Code reads this file automatically when you open the repo. It tells you what this repository is and how to work with it, so you don't need any further explanation.

## What this repository is

This is the **N1X Cortex methodology document** — an AI-assisted knowledge management methodology owned by **N1X Technologies**. It is NOT a software project or a client's vault: it's the **IP artifact** that describes the methodology itself, in a generic, reusable form that works across any domain.

> **Brand note:** the methodology used to be called **BRAIN**; since v2.0 its name is **N1X Cortex** and the attribution is **N1X Technologies**. Only the current version lives in the tree; older ones are in git history.

To understand the full methodology, **read the source document first** (the highest version):
- `N1X-Cortex-v2.md` ← **start here.** The markdown source of truth (current version).

## File inventory

| File | What it is |
|---|---|
| `N1X-Cortex-v2.md` | **Current source of truth.** The methodology content in markdown. |
| `N1X-Cortex-v2.typ` | Typst source of the current PDF — mirrors the `.md` with layout. |
| `N1X-Cortex-v2.pdf` | Compiled PDF — **git-ignored**, generated on demand (`typst compile`), not versioned. |
| `UPDATE-PROCESS.md` | **Operating procedure:** how to version, edit, and regenerate the PDF. Read it before changing anything. |
| `CLAUDE.md` | This file. |
| `README.md` | Entry point for humans. |

## What was done here (summary)

A methodology was distilled — the **4 pillars**: Atomize · Connect · Curate · AI Layer — into a structured 9-section document, and a **PDF generation pipeline** was built with Typst (see Section 6 of the document and the `PROCESO`). The document stands on its own, independent of any project the methodology is applied to.

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

This repo **describes** the methodology but isn't an operational vault. To build an N1X Cortex vault in a new project, follow the generic structure in **Section 4** of the document (folders `00-MOC/` … `09-Estrategia/`, standard frontmatter, wikilinks) and the principles in **Section 7**. The project's vault lives in that project's repo, **never here**.
