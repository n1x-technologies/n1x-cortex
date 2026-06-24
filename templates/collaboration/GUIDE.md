# Collaboration guide — N1X Cortex standard

How a team works on a repo that uses N1X Cortex: branches, pull requests, review, and co-authorship. The fillable `CONTRIBUTING` template is in [`CONTRIBUTING.template.md`](CONTRIBUTING.template.md); the commit message template in [`gitmessage.template`](gitmessage.template); the pull request one in [`PR.template.md`](PR.template.md).

> [!IMPORTANT]
> This is a **generic template**. It carries no person or project: you adopt it by copying it into your repo and filling in the `{{...}}` blanks. It works for any team, any project.

## Principles

1. **`main` is always deployable.** Nobody commits directly to `main`. Every change lands through a short branch and a pull request.
2. **One task = one branch = one PR.** Short-lived branches (hours or days, not weeks). Small PRs get reviewed fast and merged fast.
3. **Someone else reviews.** Every PR is reviewed by another teammate before it merges. On teams of two, they review each other.
4. **Authorship follows the real work.** The author of a commit is whoever writes it. Co-authorship is marked **only when the change was made jointly by several people** (see below) — never just because they're on the same team.
5. **Living cycle (Cortex).** Every learning from a change flows back into the knowledge graph, and the README is updated in the same push.

## The flow, step by step

```bash
git switch main && git pull              # start from an up-to-date main
git switch -c feat/what-you-do           # short, descriptive branch

# ...you work...
git add -A
git commit                               # the editor opens with gitmessage.template

git push -u origin feat/what-you-do
gh pr create --fill                      # opens the PR
# another teammate reviews and approves
gh pr merge --squash --delete-branch     # lands on main, deletes the branch
git switch main && git pull
```

## Branch names

`type/short-description-in-kebab`. Types: `feat`, `fix`, `chore`, `docs`, `refactor`.
Examples: `feat/login-microsoft`, `fix/timeout-retries`, `docs/onboarding-guide`.

## Commit messages (Conventional Commits)

`type(scope): summary in imperative`. Examples:
- `feat(portal): sync sources button`
- `fix(ingest): provenance in all profiles`

The body (optional) explains the *why*. The `gitmessage.template` template already ships with the structure and a co-authorship line ready to enable.

## Co-authorship — when and how

Co-authorship is **per commit**, not per organization. Mark `Co-authored-by:` **only** when the other person contributed to *that* specific change:

- ✅ They pair programmed.
- ✅ The other person wrote part of that code.
- ✅ They designed or debugged that specific solution together.
- ❌ You did it on your own (even if they're on the same team or company).

**The most natural way without sitting together: review suggestions.** When someone reviews a PR, uses *"Add a suggestion"* to propose the exact change, and the author clicks *"Commit suggestion"*, GitHub **automatically** adds the reviewer as `Co-authored-by:`. It's real collaboration (they improved your code) with no extra work.

Format (it goes at the end of the **commit message**, not in the code, with a blank line before it):

```
Co-authored-by: First Last <ID+user@users.noreply.github.com>
```

> Each person's `noreply` email is found on GitHub → Settings → Emails (format `ID+user@users.noreply.github.com`). Using the `noreply` guarantees the commit is attributed to the correct account without exposing personal emails.

## Git identity (key to making the work count)

Everyone must configure their identity with an email that is **linked and verified** in their GitHub account (ideally the `noreply`), or their commits become orphaned — they won't show up in their profile:

```bash
git config user.name  "First Last"
git config user.email "ID+user@users.noreply.github.com"
git config commit.template .gitmessage
```

## How to adopt this policy in your repo

1. Copy `CONTRIBUTING.template.md` to your repo root as `CONTRIBUTING.md` and fill in the `{{...}}`.
2. Copy `gitmessage.template` as `.gitmessage` and fill in your team's co-authorship lines (leave them commented out).
3. Copy `PR.template.md` to `.github/pull_request_template.md`.
4. Copy `setup.sh` into your repo. Each member runs it once (`bash setup.sh`): it detects their account with `gh` and configures their noreply identity + `commit.template` + the hook that blocks direct pushes to `main`. It's idempotent.
5. (Recommended) On GitHub → Settings → Branches/Rules, protect `main` to require a PR + 1 approval. **Note:** on private repos this requires a Pro/Team plan; on public repos it's free. In the meantime, the `setup.sh` hook gives you a local safety net.
