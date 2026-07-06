# Contributing to {{PROJECT_NAME}}

Thanks for contributing. This project follows the **N1X Cortex collaboration standard**: `main` is always deployable, and every change —from maintainers or the community— comes in through a **pull request**.

> Replace all `{{...}}` when adopting this template. Full standard guide: `templates/collaboration/GUIDE.md` in the N1X Cortex repo.

## Two ways to contribute

### 1. Community / external (no write access) → fork → PR

```bash
gh repo fork {{ORG}}/{{REPO}} --clone
cd {{REPO}}
bash setup.sh                       # configure your identity (once)
git switch -c feat/your-change
# ...you work...
git add -A && git commit
git push -u origin feat/your-change
gh pr create --repo {{ORG}}/{{REPO}} --fill
```

A maintainer reviews, suggests changes, and merges.

### 2. Maintainers / team (with write access) → branch → PR

```bash
git switch main && git pull
bash setup.sh                       # once per clone
git switch -c feat/your-change
# ...you work...
git add -A && git commit
git push -u origin feat/your-change
gh pr create --fill
# another maintainer reviews and approves
gh pr merge --squash --delete-branch
```

## Maintainers

| Person | GitHub user | noreply email (for co-authorship) |
|---|---|---|
| {{NAME_1}} | `{{USER_1}}` | `{{ID_1}}+{{USER_1}}@users.noreply.github.com` |
| {{NAME_2}} | `{{USER_2}}` | `{{ID_2}}+{{USER_2}}@users.noreply.github.com` |

**The team can grow.** Give a new maintainer access to the repo; on clone they run `setup.sh` —which auto-detects their account— and follow the flow above. Nothing is tied to a specific person.

## Configure your identity (once per clone)

**Fast path (recommended):** `bash setup.sh` — detects your account with `gh` and configures your **noreply** identity (so your commits are attributed to you) + `commit.template` + a hook that blocks direct push to `main`. Idempotent.

Manual:
```bash
git config user.name  "{{YOUR_NAME}}"
git config user.email "{{YOUR_ID}}+{{YOUR_USER}}@users.noreply.github.com"
git config commit.template .gitmessage
```

## Standards

- **Branches:** `feat|fix|chore|docs|refactor/description-kebab`, short-lived.
- **Commits:** Conventional Commits — `type(scope): summary in imperative`.
- Keep the README up to date in the same PR when structure or decisions change.

## Review

Maintainers review every PR before merging:

```bash
gh pr list
gh pr checkout {{N}}        # try the branch (optional)
gh pr review {{N}} --approve
```

When something can be improved, use **"Add a suggestion"** on GitHub (you propose the exact change). If the author accepts it with **"Commit suggestion"**, GitHub adds you as a co-author automatically.

## Co-authorship

Mark `Co-authored-by:` **only** when the change was truly made by more than one person (pairing, shared code, suggestion accepted in review) — not just for being on the same team. It goes at the end of the **commit message**:

```
Co-authored-by: {{NAME_2}} <{{ID_2}}+{{USER_2}}@users.noreply.github.com>
```
