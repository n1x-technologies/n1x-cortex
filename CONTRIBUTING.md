# Contributing to N1X Cortex

N1X Cortex is open source (MIT), and it uses its own methodology to collaborate too. Every contribution — from maintainers or from the community — comes in through a **pull request**, and `main` always stays deployable.

> [!NOTE]
> Just want to **use** the methodology in your own project (not improve this repo)? You don't need this guide: copy [`templates/collaboration/`](templates/collaboration/GUIDE.md) into your repo and follow its `GUIDE.md`. This CONTRIBUTING is only for improving **Cortex itself**.

## Two ways to contribute

### 1. Community / external (no write access) → fork → PR

```bash
gh repo fork n1x-technologies/n1x-cortex --clone
cd n1x-cortex
bash templates/collaboration/setup.sh          # configures your identity (once)
git switch -c feat/your-change
# ...you work...
git add -A && git commit
git push -u origin feat/your-change
gh pr create --repo n1x-technologies/n1x-cortex --fill
```

A maintainer reviews, suggests changes, and merges. Thank you!

### 2. Maintainers / team (with write access) → branch → PR

```bash
git switch main && git pull
bash templates/collaboration/setup.sh          # once per clone
git switch -c feat/your-change
# ...you work...
git add -A && git commit
git push -u origin feat/your-change
gh pr create --fill
# another maintainer reviews and approves
gh pr merge --squash --delete-branch
```

## Maintainers

| Person | GitHub |
|---|---|
| Sebastian Dominguez | `wagnersebastiandc` |
| Santiago Anticona | `otakusimao` |

**The team can grow.** A new maintainer gets access to the repo (org `n1x-technologies`); when they clone, they run `setup.sh` — which detects their account automatically — and then follow the flow above. Nothing is tied to any one person.

## Configure your identity (once per clone)

**Fast path (recommended):** `bash templates/collaboration/setup.sh` — detects your account with `gh` and configures your identity with your GitHub **noreply** email (so your commits are attributed to you) + `commit.template` + a hook that blocks direct pushes to `main`. Idempotent.

Manual:
```bash
git config user.name  "Your Name"
git config user.email "YOUR_ID+YOUR_USERNAME@users.noreply.github.com"   # GitHub → Settings → Emails
git config commit.template .gitmessage
```

## Standards

- **Branches:** `feat|fix|chore|docs|refactor/description-kebab`, short-lived.
- **Commits:** Conventional Commits — `type(scope): summary in imperative`.
- **README current on every push** (N1X Cortex convention): if the change touches structure or decisions, update the README in the same PR.
- **Markdown is the source of truth;** the PDF is derived output (see `UPDATE-PROCESS.md`).
- **🔒 Confidentiality:** this repo is generic and public. Never include real data from any client or project (see `CLAUDE.md`).

## Review and co-authorship

Maintainers review the PRs. When you can improve someone's code, use **"Add a suggestion"** on GitHub: if they accept it with **"Commit suggestion"**, GitHub adds you as a co-author automatically.

Add `Co-authored-by:` **only** when the change was genuinely made by two people (pairing, shared code, or a suggestion accepted in review) — not just for being on the same team. Most commits ship with a single author.
