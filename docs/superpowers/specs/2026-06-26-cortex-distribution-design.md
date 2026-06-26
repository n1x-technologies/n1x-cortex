# Cortex Distribution — publish `@n1x-technologies/cortex` to npm — design

> **Status:** approved direction, pending implementation plan.
> **Builds on:** the Phase 6 semantic layer (branch `feat/cortex-semantic-layer-phase6`, PR #24). This slice is **stacked** on that branch: it moves `@xenova/transformers` to an optional peer and refines `commands/embed.ts` error handling, both of which require the semantic layer to exist. Land after PR #24 merges (rebase onto `main`), or merge the two together.
> **Branch:** `feat/cortex-distribution`.

## 1. Goal

Turn the toolkit from a clone-and-build repo into a **one-command installable product**:

```bash
npm i -g @n1x-technologies/cortex      # or: npx @n1x-technologies/cortex
cortex query "..."
```

The package is already a `bin` package (`@n1x/cortex`, `bin.cortex → dist/cli.js`); it has simply never been published and uses a scope the org does not own. This slice fixes the packaging metadata, makes the heavy semantic dependency opt-in so the base install stays light, adds an MIT license, and sets up a reproducible **CI-on-tag** release so either maintainer (Sebastian, Santi) can publish without local credentials.

## 2. Design principles

- **Light base install.** A user who only wants `init`/`status`/`query`/`dupes`/`viz`/`atomize` must not download the heavy ML stack. Semantic (`embed` + the semantic half of `query`/`dupes`) is opt-in.
- **Reproducible, team-owned releases.** The release recipe lives in the repo, not on a laptop. A git tag triggers it; a single repo secret (`NPM_TOKEN`) authenticates it. No "works on my machine."
- **The command stays `cortex`.** The npm package name changes (`@n1x-technologies/cortex`) but the installed binary name is unchanged.
- **Publishability is guarded by a test.** The publish-critical invariants (scope, public access, license, `files`, peer-not-dep, shebang) are asserted in an automated test so a future edit cannot silently break distribution.
- **Open-source, MIT.** Consistent with the repo's stated "open-source product" framing; attribution stays **N1X Technologies**.

## 3. Package metadata (`toolkit/package.json`)

```jsonc
{
  "name": "@n1x-technologies/cortex",   // was @n1x/cortex — org owns @n1x-technologies
  "version": "0.1.0",                    // was 0.0.0 — first published release
  "description": "Turn any markdown vault into an AI-queryable knowledge graph (CLI + local viewer + cited query + AI atomization).",
  "license": "MIT",
  "type": "module",
  "bin": { "cortex": "./dist/cli.js" },  // unchanged
  "files": ["dist/"],                     // ship only the build (README + LICENSE copied into pkg dir by scripts/copy-meta.mjs at build/prepack time)
  "engines": { "node": ">=18" },
  "keywords": ["knowledge-graph", "markdown", "obsidian", "cli", "rag", "notes", "zettelkasten"],
  "repository": { "type": "git", "url": "git+https://github.com/n1x-technologies/n1x-cortex.git", "directory": "toolkit" },
  "homepage": "https://github.com/n1x-technologies/n1x-cortex#readme",
  "bugs": { "url": "https://github.com/n1x-technologies/n1x-cortex/issues" },
  "publishConfig": { "access": "public" },  // scoped packages are private by default
  "scripts": {
    "test": "vitest run",
    "build": "tsc && node scripts/copy-static.mjs",
    "cli": "tsx src/cli.ts",
    "prepublishOnly": "npm run build"       // safety net: dist/ always fresh on publish
  }
}
```

- **`publishConfig.access: "public"`** is mandatory — without it, `npm publish` of a scoped package errors (defaults to a paid private package).
- **`files: ["dist/"]`** — `dist/` is git-ignored but npm packs by the `files` allowlist, so the built output (including `dist/viz/static` from `copy-static.mjs`) ships; `src/` and `test/` do not.
- **Shebang:** add `#!/usr/bin/env node` as the **first line** of `src/cli.ts`. TypeScript preserves a leading shebang in emit, making `dist/cli.js` directly executable; npm sets the executable bit on the `bin` target at install time.

## 4. Dependency strategy — optional peer

Move the heavy ML dependency so it is **not** auto-installed:

```jsonc
{
  "dependencies": { "cytoscape": "^3.34.0", "gray-matter": "^4.0.3" },
  "peerDependencies": { "@xenova/transformers": "^2.17.2" },
  "peerDependenciesMeta": { "@xenova/transformers": { "optional": true } },
  "devDependencies": { "@xenova/transformers": "^2.17.2", "@types/node": "...", "tsx": "...", "typescript": "...", "vitest": "..." }
}
```

- With npm 7+, an **optional** peer dependency is **not** installed automatically — the base `npm i -g @n1x-technologies/cortex` pulls only `cytoscape` + `gray-matter`.
- It stays in `devDependencies` so the repo's own build and test suite (which inject a stub but compile against the types) continue to work locally and in CI.
- **Runtime behavior (already mostly in place):** `createTransformersEmbedder` uses a dynamic `import('@xenova/transformers')`. When the package is absent, that import throws `ERR_MODULE_NOT_FOUND`.

### 4.1 Distinguishing "not installed" from "download failed"

`commands/embed.ts` currently catches embedder-creation failures and rethrows the Phase 6 §7 message `could not download model "<id>"`. Refine the catch to branch on the error:

- **Module not found** (`err.code === 'ERR_MODULE_NOT_FOUND'`, or the message references `@xenova/transformers`) → throw:
  `Semantic support is optional and not installed. Enable it with:  npm i -g @xenova/transformers`
- **Otherwise** (installed but the model download/init failed) → keep the existing `could not download model "<id>" — check your network connection` message.

`semantic/queryRank.ts` is unchanged: it already catches any embedder failure and returns `[]`, so `cortex query`/`dupes` degrade silently to lexical when the optional dep is absent — which is the correct behavior for an opt-in feature.

## 5. Release pipeline

### 5.1 `.github/workflows/release.yml` — publish on tag

```yaml
name: release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: toolkit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm test
      - run: npm run build
      - name: Verify tag matches package version
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          PKG="$(node -p "require('./package.json').version")"
          test "$TAG" = "$PKG" || { echo "tag $TAG != package version $PKG"; exit 1; }
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- The **tag-vs-version guard** prevents publishing a version that does not match the tag.
- `NPM_TOKEN` is an npm **automation** token (bypasses 2FA), stored once as a repo Actions secret.

### 5.2 `.github/workflows/ci.yml` — test on push/PR

The repo currently has **no CI**. Add a minimal test workflow so the suite runs on every push and PR (the two maintainers' safety net):

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: toolkit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
      - run: npm run build
```

### 5.3 Release flow (documented for maintainers)

> bump `version` in `toolkit/package.json` → PR → merge to `main` → `git tag vX.Y.Z && git push --tags` → CI tests, builds, and publishes.

First release: **`0.1.0`**.

## 6. License & docs

- **`LICENSE`** (repo root) — MIT text, `Copyright (c) 2026 N1X Technologies`.
- **`license: "MIT"`** in `package.json` (§3).
- **README** — replace the "clone + build" quick-start with the npm flow:
  ```
  npm i -g @n1x-technologies/cortex        # or: npx @n1x-technologies/cortex
  cortex query "..."
  # semantic search (optional): npm i -g @xenova/transformers && cortex embed
  ```
  Keep the from-source instructions in a "Contributing / from source" subsection. (Satisfies the repo's README-on-every-push convention.)
- **CLAUDE.md** — note the published package name and the tag-based release flow.

## 7. Verification

- **`npm pack --dry-run`** (run in CI before publish and inspectable locally): confirms the tarball contains `dist/` (incl. `dist/viz/static`) and the `bin`, and excludes `src/`/`test/`.
- **`test/packaging.test.ts`** — an automated guard that reads `toolkit/package.json` and asserts the publish-critical invariants:
  - `name === "@n1x-technologies/cortex"`
  - `publishConfig.access === "public"`
  - `license === "MIT"`
  - `files` includes `"dist/"`
  - `@xenova/transformers` is in `peerDependencies` and **not** in `dependencies`
  - `peerDependenciesMeta["@xenova/transformers"].optional === true`
  - `bin.cortex === "./dist/cli.js"`
  - `src/cli.ts` first line is `#!/usr/bin/env node`
- **Manual smoke (optional, non-blocking):** `npm pack` → `npm i -g ./<tarball>` in a throwaway prefix → `cortex status` runs **without** the optional dep installed, proving the light base works end-to-end.

## 8. Out of scope (deferred)

- Homebrew tap / single-binary (`pkg`/`bun`) distribution — npm is idiomatic for a Node CLI; revisit only if non-Node users need it.
- Auto-bumping version from conventional commits / changesets — manual version bump is fine for two maintainers at this stage.
- Splitting into separate `@n1x-technologies/cortex-semantic` package — the optional-peer approach already keeps the base light; a second package is more release surface than warranted now.
- Publishing provenance / npm provenance attestation — a nice hardening follow-up, not required for first release.
