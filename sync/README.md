# Cortex Sync — keep consumer projects up to date

Cortex is the **source of truth** for the shared templates (Typst document engine, collaboration workflow, README standard). Projects that use Cortex — any downstream repo — shouldn't re-do template upgrades by hand every time Cortex changes. `cortex-sync` lets a consumer **pull the latest with one command**.

## The one idea: engine vs instance

Every shared file is one of two kinds:

| Kind | Examples | On sync |
|---|---|---|
| **engine** (generic, no project content) | `templates/typst/template.typ` | **Overwritten** — always safe, because branding/localization lives in *separate* instance files. |
| **instance** (localized / filled per project) | `brand.typ`, your `CONTRIBUTING.md`, translated `setup.sh` | **Never touched.** Sync only **flags** when the upstream original changed, so you reconcile by hand. |

That split is what makes auto-updates safe. The Typst template is the model: `template.typ` is the engine (synced); `brand.typ` holds your logos/colors (yours, never overwritten).

## What Cortex publishes

See [`manifest`](manifest) — each line is `id | mode | source | note`. `mode` is `overwrite` (engine) or `notify` (instance).

## Onboarding a consumer (once per repo)

1. Create a `.cortex-sync` at the repo root, adopting the artifacts you want:

   ```
   cortex_source=https://github.com/n1x-technologies/n1x-cortex.git   # or a local path, e.g. ../n1x-cortex
   ref=main
   # <id from manifest> = <destination path in THIS repo>
   typst-engine=cortex/templates/typst/template.typ
   collab-pr=.github/pull_request_template.md
   ```

2. Commit `.cortex-sync` (and later `.cortex-sync.lock`, which records the synced version + hashes).

## Updating (any time)

```bash
# dry run — see what would change, write nothing:
bash <(curl -fsSL https://raw.githubusercontent.com/n1x-technologies/n1x-cortex/main/sync/cortex-sync.sh) --check

# apply:
bash <(curl -fsSL https://raw.githubusercontent.com/n1x-technologies/n1x-cortex/main/sync/cortex-sync.sh)
```

(Or clone Cortex and run `bash sync/cortex-sync.sh -C /path/to/your/repo`.)

Output legend: `=` up-to-date · `↑` updated (engine replaced) · `+` new file · `i` instance now tracked · `!` **upstream changed — instance file, review by hand**.

Then review the diff and commit. Engine updates land as a normal change in your repo (and, per the N1X convention, go through a branch → PR).

## Requirements

`bash`, `git`, `diff`, and `sha256sum` or `shasum`. No other dependencies (no `jq`).

## Adding a new shared file to Cortex

1. Put the generic file under `templates/…`.
2. Add a line to [`manifest`](manifest) with the right `mode`.
3. Bump [`VERSION`](../VERSION).
4. Consumers map the new `id` in their `.cortex-sync` when they want it.
