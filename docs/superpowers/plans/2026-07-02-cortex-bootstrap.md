# Cortex Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cortex bootstrap [path] --model <provider:model> [--base-url <url>] [--write]` walks a repo and distills every eligible file (code + docs) into atomic concept `draft` notes in `_inbox/`, reusing the portable-distillation seam from PR #66, streaming per-file progress, and reversing the whole run with one `cortex undo`.

**Architecture:** A thin pipeline over the existing engine: `discover` (git-aware repo walk) → `ingest.buildWorksheet` (routes doc→markdown-segments / code→whole-file, attaches the right methodology) → `distillWorksheetWithLlm` (the #1 distiller, refactored to accept a prebuilt worksheet) → `applyDistilledInput` (existing reversible write) under one shared runId. Two drivers share the engine: a BYO-key CLI loop and a small MCP surface for agents.

**Tech Stack:** Node ≥18 (ESM, native `fetch`), TypeScript, vitest. `git` CLI is used at runtime (via `child_process`) to respect `.gitignore`; no new npm dependencies.

## Global Constraints

- **ESM with `.js` import specifiers** — every relative import ends in `.js` even from `.ts` sources.
- **No new npm dependencies.** `.gitignore` is respected by shelling out to `git ls-files` (git is already required to use the repo); large-file handling is manual chunking, not a parser/library.
- **Dry-run is the default** — bootstrap writes only with `--write`; without it, print the manifest + counts and write nothing.
- **Reuse the engine, never reimplement** — distillation ends at `applyDistilledInput` (`(vaultDir, input: DistilledInput, config, opts?: { dryRun?; force?; runId? }) => DistilledApplyResult`); no new write/backup/slug logic.
- **The repo's own files are read in place, never copied into `Markdown/` and never modified.** Distilled notes cite the file by its repo-relative path.
- **One shared runId for the whole run.** Every file's apply gets the same runId; the orchestrator calls `recordCreations(vaultDir, allCreatedPaths, runId)` **exactly once at the end** (never per-file — `recordCreations` overwrites its `{runId}.json`), so `cortex undo` reverses every draft the bootstrap created in one call.
- **API keys only from environment** (via #1's `makeLlmClient`); never a flag.
- **Fail-safe:** continue-on-error per file (one bad file never aborts the run); `cortex bootstrap` (CLI) with no `--model` → usage error, return 1; missing key → the named-env-var error from #1.
- **Tests:** `npm test` runs `vitest run` from `toolkit/`; single file via `npx vitest run test/<file>.test.ts`.
- **Generic/public repo** — no client names, real metrics, or proprietary data in code, tests, or docs.

---

### Task 1: The code distillation methodology

**Files:**
- Modify: `toolkit/src/atomize/methodology.ts` (add a second export)
- Test: `toolkit/test/methodology.test.ts` (add a describe block)

**Interfaces:**
- Produces: `export const DISTILL_METHODOLOGY_CODE: string` from `atomize/methodology.js`.

- [ ] **Step 1: Write the failing test**

Add to `toolkit/test/methodology.test.ts`:

```ts
import { DISTILL_METHODOLOGY_CODE } from '../src/atomize/methodology.js';

describe('DISTILL_METHODOLOGY_CODE', () => {
  it('is a non-trivial instruction block for code sources', () => {
    expect(DISTILL_METHODOLOGY_CODE.length).toBeGreaterThan(400);
  });
  it('carries the code-tuned rules', () => {
    const t = DISTILL_METHODOLOGY_CODE.toLowerCase();
    expect(t).toContain('code');
    expect(t).toMatch(/concept|responsibilit|flow|decision/); // extract concepts, not line-by-line
    expect(t).toMatch(/line-by-line|line by line|restate/);   // the "don't restate" rule
    expect(t).toContain('[[');                                 // phantom-wikilink rule referenced
    expect(t).toContain('cite');                               // citations mandatory
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/methodology.test.ts`
Expected: FAIL — `DISTILL_METHODOLOGY_CODE` is not exported.

- [ ] **Step 3: Add the constant**

Append to `toolkit/src/atomize/methodology.ts`:

```ts
// The methodology variant for a CODE source (used by cortex bootstrap). Same
// core rules as DISTILL_METHODOLOGY, reframed: the worksheet's segment(s) are
// source code, not prose, so the model must extract the concepts the code
// embodies rather than paraphrase it line-by-line.
export const DISTILL_METHODOLOGY_CODE = `You are the AI distillation layer of N1X Cortex, reading a CODE file to build a knowledge graph. You are given a worksheet (JSON) whose segment(s) contain source code from one file, plus the vault's known types, known folders and existing notes. Distill the code into atomic concept notes. The deterministic toolkit writes the files — you only produce data.

Follow this methodology exactly:

- Extract CONCEPTS, not lines. Capture what this code is FOR — its responsibilities, the flows it implements, the domain concepts and rules it encodes, and notable design decisions. Do NOT restate the code line-by-line, and do NOT write a note for every trivial function, getter, or import.
- Atomic — one idea per note. If the file embodies several independent concepts, split them into several notes.
- Type: choose from the worksheet's \`knownTypes\` (e.g. concept/flow/rule/technical/…). Only introduce a new type when none fits, and say so.
- Folder: route from the worksheet's \`knownFolders\`. Cold-vault fallback: if empty, seed the canonical vocabulary (types concept/flow/rule/technical/error/security/ux/mvp/strategy; folders 01-Concepts/ … 09-Strategy/), localized to the worksheet's \`lang\` when set.
- Body: clean, structured natural language describing the concept — a reader who never sees the code should understand it. For a flow/process, add an "Implications for implementation" section.
- Connect: add [[wikilinks]] to related notes, including notes in the worksheet's \`existing\` list. Dangling links are valid.
- NEVER write illustrative or example [[wikilinks]] in a body. The engine parses every [[...]] as a real link, so example syntax becomes a phantom orphan. Only link to notes that exist or that you are genuinely creating; to describe link syntax, use prose or inline code.
- Tags + language: add \`tags\`; write every note in the worksheet's \`lang\`.
- No duplicates: if a strong match already exists in \`existing\`, drop that note. If a segment adds to an existing note, emit an update { "action": "update", "targetPath": "<existing path>", "title", "body": "<full merged body incl. heading>" }.
- Cite the source — the toolkit adds the citation from the worksheet's \`source\` (the file path); keep it correct.

Return ONLY a JSON object of shape { "source": "<worksheet.source>", "notes": [ ... ] }, where each note is either a create { "title", "type", "folder", "tags", "body", "fromHeading" } or an update { "action": "update", "targetPath", "title", "body" }.`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/methodology.test.ts`
Expected: PASS (existing `DISTILL_METHODOLOGY` cases + the new code cases).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/methodology.ts toolkit/test/methodology.test.ts
git commit -m "feat(bootstrap): code distillation methodology constant"
```

---

### Task 2: Extract `gatherVaultContext` (shared by emit and ingest)

**Files:**
- Modify: `toolkit/src/atomize/emit.ts`
- Test: `toolkit/test/emit.test.ts` (add one case; existing cases must stay green)

**Interfaces:**
- Produces: `export function gatherVaultContext(vaultDir: string, config: CortexConfig): { knownTypes: string[]; knownFolders: string[]; existing: EmitExistingNote[] }` from `atomize/emit.js`. `emitPlan` keeps its exact current signature and output.

- [ ] **Step 1: Write the failing test**

Add to `toolkit/test/emit.test.ts`:

```ts
import { gatherVaultContext } from '../src/atomize/emit.js';

describe('gatherVaultContext', () => {
  it('returns curated types/folders and all existing notes', () => {
    const dir = vault(); // existing helper: creates 01-Concepts, 03-Rules, _inbox notes + Markdown/src.md
    const ctx = gatherVaultContext(dir, loadConfig(dir, []));
    expect(ctx.knownTypes.sort()).toEqual(['concept', 'rule']); // _inbox 'draftish' excluded
    expect(ctx.knownFolders.sort()).toEqual(['01-Concepts', '03-Rules']);
    expect(ctx.existing.some(n => n.path === '_inbox/old.md')).toBe(true);
    expect(ctx.existing.some(n => n.path.startsWith('Markdown/'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/emit.test.ts`
Expected: FAIL — `gatherVaultContext` is not exported.

- [ ] **Step 3: Extract the helper and use it in `emitPlan`**

Rewrite `toolkit/src/atomize/emit.ts` to:

```ts
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { segmentSource } from './segment.js';
import { scanVault } from '../vault.js';
import { DISTILL_METHODOLOGY } from './methodology.js';
import type { AtomizeEmitPlan, EmitExistingNote, CortexConfig } from '../types.js';

const INBOX = '_inbox';

/** Curated types/folders + all existing notes — the vault context every worksheet carries. */
export function gatherVaultContext(vaultDir: string, config: CortexConfig): {
  knownTypes: string[]; knownFolders: string[]; existing: EmitExistingNote[];
} {
  const notes = scanVault(vaultDir, config); // already excludes Markdown/ (sourcesDir)
  const curated = notes.filter(n => n.folder !== INBOX);
  const knownTypes = [...new Set(curated.map(n => n.type).filter((t): t is string => !!t))].sort();
  const knownFolders = [...new Set(curated.map(n => n.folder).filter((f): f is string => !!f))].sort();
  const existing: EmitExistingNote[] = notes.map(n => ({
    id: n.id, title: n.title, path: n.path, type: n.type, folder: n.folder,
  }));
  return { knownTypes, knownFolders, existing };
}

export function emitPlan(vaultDir: string, sourcePath: string, config: CortexConfig): AtomizeEmitPlan {
  const source = basename(sourcePath).replace(/\.md$/i, '');
  const text = readFileSync(sourcePath, 'utf8');
  const segments = segmentSource(text);
  const { knownTypes, knownFolders, existing } = gatherVaultContext(vaultDir, config);
  return {
    source,
    sourcePath,
    lang: config.lang,
    fields: config.fields,
    statusFirst: config.statusLifecycle[0] ?? 'draft',
    knownTypes,
    knownFolders,
    existing,
    segments,
    instructions: DISTILL_METHODOLOGY,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/emit.test.ts`
Expected: PASS — the new `gatherVaultContext` case plus all pre-existing `emitPlan` cases (unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/emit.ts toolkit/test/emit.test.ts
git commit -m "refactor(atomize): extract gatherVaultContext for reuse by bootstrap ingest"
```

---

### Task 3: `distillWorksheetWithLlm` (distill a prebuilt worksheet)

**Files:**
- Modify: `toolkit/src/atomize/distill-llm.ts`
- Test: `toolkit/test/distill-llm.test.ts` (add cases; existing cases stay green)

**Interfaces:**
- Consumes: `applyDistilledInput` (existing), `buildDistillPrompt`, `parseDistilledResponse` (existing in this file), `LlmClient`, `AtomizeEmitPlan`.
- Produces: `export async function distillWorksheetWithLlm(vaultDir: string, worksheet: AtomizeEmitPlan, config: CortexConfig, client: LlmClient, opts?: { write?: boolean; force?: boolean; runId?: string }): Promise<DistilledApplyResult>`. `distillWithLlm` keeps its signature and becomes a wrapper.

- [ ] **Step 1: Write the failing test**

Add to `toolkit/test/distill-llm.test.ts` (reuse the file's `vault()` helper and `fakeClient`):

```ts
import { distillWorksheetWithLlm } from '../src/atomize/distill-llm.js';
import { emitPlan } from '../src/atomize/emit.js';

describe('distillWorksheetWithLlm', () => {
  it('distills a prebuilt worksheet and honors the passed runId + dry-run default', async () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const worksheet = emitPlan(dir, join(dir, 'Markdown', 'src.md'), cfg);
    const client = fakeClient(JSON.stringify({ source: 'ignored', notes: [cannedNote] }));
    const res = await distillWorksheetWithLlm(dir, worksheet, cfg, client, { write: true, runId: 'run-fixed-1' });
    expect(res.plan.dryRun).toBe(false);
    expect(res.written.length).toBeGreaterThan(0);
  });
  it('defaults to dry-run when write is omitted', async () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const worksheet = emitPlan(dir, join(dir, 'Markdown', 'src.md'), cfg);
    const res = await distillWorksheetWithLlm(dir, worksheet, cfg, fakeClient(JSON.stringify({ source: 'x', notes: [cannedNote] })));
    expect(res.plan.dryRun).toBe(true);
    expect(res.written).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/distill-llm.test.ts`
Expected: FAIL — `distillWorksheetWithLlm` is not exported.

- [ ] **Step 3: Add the function and make `distillWithLlm` a wrapper**

In `toolkit/src/atomize/distill-llm.ts`, replace the existing `distillWithLlm` with:

```ts
/** Distill an already-built worksheet (doc OR code). The seam bootstrap reuses. Dry-run by default. */
export async function distillWorksheetWithLlm(
  vaultDir: string,
  worksheet: AtomizeEmitPlan,
  config: CortexConfig,
  client: LlmClient,
  opts: { write?: boolean; force?: boolean; runId?: string } = {},
): Promise<DistilledApplyResult> {
  const { system, user } = buildDistillPrompt(worksheet);
  const reply = await client.complete(system, user);
  const input = parseDistilledResponse(reply, worksheet.source);
  return applyDistilledInput(vaultDir, input, config, { dryRun: !opts.write, force: opts.force, runId: opts.runId });
}

/** emit → distill the markdown worksheet. Thin wrapper over distillWorksheetWithLlm. */
export async function distillWithLlm(
  vaultDir: string,
  sourcePath: string,
  config: CortexConfig,
  client: LlmClient,
  opts: { write?: boolean; force?: boolean } = {},
): Promise<DistilledApplyResult> {
  const worksheet = emitPlan(vaultDir, sourcePath, config);
  return distillWorksheetWithLlm(vaultDir, worksheet, config, client, opts);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/distill-llm.test.ts`
Expected: PASS — the new `distillWorksheetWithLlm` cases plus all pre-existing `distillWithLlm`/`buildDistillPrompt`/`parseDistilledResponse` cases.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/distill-llm.ts toolkit/test/distill-llm.test.ts
git commit -m "refactor(atomize): distillWorksheetWithLlm seam for prebuilt worksheets"
```

---

### Task 4: `discover` — the git-aware repo walk

**Files:**
- Create: `toolkit/src/atomize/bootstrap/discover.ts`
- Test: `toolkit/test/bootstrap-discover.test.ts`

**Interfaces:**
- Produces:
  - `interface ManifestEntry { path: string; kind: 'doc' | 'code'; bytes: number }`
  - `interface DiscoverResult { files: ManifestEntry[]; skipped: { path: string; reason: string }[] }`
  - `function discover(root: string, config: CortexConfig): DiscoverResult`

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/bootstrap-discover.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover } from '../src/atomize/bootstrap/discover.js';
import { loadConfig } from '../src/config.js';

function gitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-disc-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(join(dir, '.gitignore'), 'ignored.txt\nsecret/\n');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'foo.ts'), 'export const x = 1;\n');
  writeFileSync(join(dir, 'README.md'), '# Hi\n');
  writeFileSync(join(dir, 'ignored.txt'), 'nope\n');
  mkdirSync(join(dir, 'secret'));
  writeFileSync(join(dir, 'secret', 's.ts'), 'export const s = 1;\n');
  mkdirSync(join(dir, 'node_modules', 'p'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'p', 'i.js'), 'module.exports=1;\n');
  writeFileSync(join(dir, 'package-lock.json'), '{}\n');
  writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02])); // null byte → binary
  return dir;
}

describe('discover', () => {
  it('classifies code/doc and respects .gitignore + skip rules', () => {
    const dir = gitRepo();
    const { files, skipped } = discover(dir, loadConfig(dir, []));
    const paths = files.map(f => f.path).sort();
    expect(paths).toContain('src/foo.ts');
    expect(paths).toContain('README.md');
    expect(files.find(f => f.path === 'src/foo.ts')!.kind).toBe('code');
    expect(files.find(f => f.path === 'README.md')!.kind).toBe('doc');
    // gitignored, vendored, lockfile, binary all excluded from files
    for (const p of ['ignored.txt', 'secret/s.ts', 'node_modules/p/i.js', 'package-lock.json', 'logo.png']) {
      expect(paths).not.toContain(p);
    }
    // binary + lockfile appear in skipped with a reason
    expect(skipped.some(s => s.path === 'logo.png' && /binary/i.test(s.reason))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/bootstrap-discover.test.ts`
Expected: FAIL — `Cannot find module '../src/atomize/bootstrap/discover.js'`.

- [ ] **Step 3: Implement `discover`**

Create `toolkit/src/atomize/bootstrap/discover.ts`:

```ts
// toolkit/src/atomize/bootstrap/discover.ts
//
// Repo walk for `cortex bootstrap`. Respects .gitignore by asking git itself
// (`git ls-files`) — no ignore-matching library, no new dependency. Falls back
// to a plain recursive walk for non-git directories. Classifies each file as a
// code or doc source and skips what can't be distilled (binaries, lockfiles,
// vendored, oversized, and Cortex's own output folders).

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, extname, basename, sep } from 'node:path';
import type { CortexConfig } from '../../types.js';

export interface ManifestEntry { path: string; kind: 'doc' | 'code'; bytes: number }
export interface DiscoverResult { files: ManifestEntry[]; skipped: { path: string; reason: string }[] }

const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.rb', '.php',
  '.java', '.kt', '.scala', '.swift', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs',
  '.sh', '.bash', '.sql', '.vue', '.svelte', '.lua', '.r', '.dart',
]);
const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.cortex', '_inbox', 'dist', 'build', 'vendor', 'coverage', '.next', '.venv']);
const LOCK_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 'poetry.lock', 'composer.lock', 'gemfile.lock']);
const MAX_BYTES = 256_000;

/** List candidate files relative to root: git-tracked + untracked-not-ignored, or a plain walk. */
function listFiles(root: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\n').filter(Boolean);
  } catch {
    // Not a git repo (or git unavailable) → walk, applying SKIP_DIRS.
    const acc: string[] = [];
    const walk = (abs: string) => {
      for (const name of readdirSync(abs)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(abs, name);
        if (statSync(full).isDirectory()) walk(full);
        else acc.push(relative(root, full).split(sep).join('/'));
      }
    };
    walk(root);
    return acc;
  }
}

/** First 4 KB contains a NUL byte → treat as binary. */
function looksBinary(abs: string): boolean {
  try {
    const buf = readFileSync(abs).subarray(0, 4096);
    return buf.includes(0);
  } catch { return true; }
}

export function discover(root: string, config: CortexConfig): DiscoverResult {
  const files: ManifestEntry[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const sourcesDir = config.sourcesDir.replace(/\/$/, '');

  for (const rel of listFiles(root)) {
    const segs = rel.split('/');
    if (segs.some(s => SKIP_DIRS.has(s)) || segs[0] === sourcesDir) { continue; } // Cortex/vendored dirs: silent skip
    const ext = extname(rel).toLowerCase();
    const name = basename(rel).toLowerCase();
    const abs = join(root, rel);
    if (LOCK_FILES.has(name) || name.endsWith('.min.js') || name.endsWith('.min.css')) { skipped.push({ path: rel, reason: 'lockfile/minified' }); continue; }
    const kind = CODE_EXT.has(ext) ? 'code' : DOC_EXT.has(ext) ? 'doc' : null;
    if (!kind) { skipped.push({ path: rel, reason: `unsupported extension (${ext || 'none'})` }); continue; }
    let bytes = 0;
    try { bytes = statSync(abs).size; } catch { skipped.push({ path: rel, reason: 'unreadable' }); continue; }
    if (bytes > MAX_BYTES) { skipped.push({ path: rel, reason: `too large (${bytes} bytes)` }); continue; }
    if (looksBinary(abs)) { skipped.push({ path: rel, reason: 'binary' }); continue; }
    files.push({ path: rel, kind, bytes });
  }
  return { files, skipped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/bootstrap-discover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/bootstrap/discover.ts toolkit/test/bootstrap-discover.test.ts
git commit -m "feat(bootstrap): git-aware repo discovery + file classification"
```

---

### Task 5: `chunkCode` — split oversized code files

**Files:**
- Create: `toolkit/src/atomize/bootstrap/chunk.ts`
- Test: `toolkit/test/bootstrap-chunk.test.ts`

**Interfaces:**
- Produces: `function chunkCode(text: string, maxChars: number): string[]` — one chunk when `text.length <= maxChars`; otherwise line-boundary chunks each `<= maxChars` (a single line longer than `maxChars` becomes its own chunk), losing no lines and preserving order.

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/bootstrap-chunk.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { chunkCode } from '../src/atomize/bootstrap/chunk.js';

describe('chunkCode', () => {
  it('returns a single chunk when under the budget', () => {
    expect(chunkCode('a\nb\nc', 100)).toEqual(['a\nb\nc']);
  });
  it('splits at line boundaries and loses no content', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`);
    const chunks = chunkCode(lines.join('\n'), 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(30);
    expect(chunks.join('\n').split('\n')).toEqual(lines); // every line preserved, in order
  });
  it('keeps a single over-long line as its own chunk', () => {
    const long = 'x'.repeat(50);
    expect(chunkCode(long, 10)).toEqual([long]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/bootstrap-chunk.test.ts`
Expected: FAIL — `Cannot find module '../src/atomize/bootstrap/chunk.js'`.

- [ ] **Step 3: Implement `chunkCode`**

Create `toolkit/src/atomize/bootstrap/chunk.ts`:

```ts
// toolkit/src/atomize/bootstrap/chunk.ts
//
// Split an oversized code file into line-boundary chunks that each fit the
// model budget. No parsing — purely size-based, order-preserving, lossless.

export function chunkCode(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let len = 0;
  for (const line of lines) {
    const add = line.length + (current.length ? 1 : 0); // +1 for the rejoining '\n'
    if (current.length && len + add > maxChars) {
      chunks.push(current.join('\n'));
      current = [];
      len = 0;
    }
    current.push(line);
    len += current.length === 1 ? line.length : add;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/bootstrap-chunk.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/bootstrap/chunk.ts toolkit/test/bootstrap-chunk.test.ts
git commit -m "feat(bootstrap): lossless line-boundary code chunking"
```

---

### Task 6: `buildWorksheet` — turn a repo file into a distillation worksheet

**Files:**
- Create: `toolkit/src/atomize/bootstrap/ingest.ts`
- Test: `toolkit/test/bootstrap-ingest.test.ts`

**Interfaces:**
- Consumes: `gatherVaultContext` (Task 2), `segmentSource` (`atomize/segment.js`), `chunkCode` (Task 5), `DISTILL_METHODOLOGY` + `DISTILL_METHODOLOGY_CODE` (Task 1 / existing), `AtomizeEmitPlan`, `Segment`.
- Produces: `function buildWorksheet(vaultDir: string, filePath: string, kind: 'doc' | 'code', config: CortexConfig): AtomizeEmitPlan`. `filePath` is repo-relative; the worksheet's `source` is that repo-relative path (the citation).

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/bootstrap-ingest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorksheet } from '../src/atomize/bootstrap/ingest.js';
import { loadConfig } from '../src/config.js';
import { DISTILL_METHODOLOGY, DISTILL_METHODOLOGY_CODE } from '../src/atomize/methodology.js';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-ingest-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, '03-Rules', 'b.md'), '---\ntype: rule\n---\n# Existing');
  writeFileSync(join(dir, 'src', 'foo.ts'), 'export function add(a:number,b:number){return a+b;}\n');
  writeFileSync(join(dir, 'README.md'), '# Title\n\n## Section\n\nBody.');
  return dir;
}

describe('buildWorksheet', () => {
  it('builds a code worksheet: whole file as a segment + code methodology + repo-relative source', () => {
    const dir = vault();
    const w = buildWorksheet(dir, 'src/foo.ts', 'code', loadConfig(dir, []));
    expect(w.source).toBe('src/foo.ts');
    expect(w.instructions).toBe(DISTILL_METHODOLOGY_CODE);
    expect(w.segments.length).toBeGreaterThanOrEqual(1);
    expect(w.segments.map(s => s.body).join('\n')).toContain('export function add');
    expect(w.knownFolders).toContain('03-Rules'); // vault context present
  });
  it('builds a doc worksheet: heading segments + prose methodology', () => {
    const dir = vault();
    const w = buildWorksheet(dir, 'README.md', 'doc', loadConfig(dir, []));
    expect(w.source).toBe('README.md');
    expect(w.instructions).toBe(DISTILL_METHODOLOGY);
    expect(w.segments.map(s => s.heading)).toContain('Section');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/bootstrap-ingest.test.ts`
Expected: FAIL — `Cannot find module '../src/atomize/bootstrap/ingest.js'`.

- [ ] **Step 3: Implement `buildWorksheet`**

Create `toolkit/src/atomize/bootstrap/ingest.ts`:

```ts
// toolkit/src/atomize/bootstrap/ingest.ts
//
// Turn one repo file into an AtomizeEmitPlan worksheet — the same shape emit.ts
// produces for markdown, so it flows through distillWorksheetWithLlm and
// applyDistilledInput unchanged. Routes by kind: docs reuse the heading
// segmenter + prose methodology; code becomes whole-file (or chunked) segments
// + the code methodology. The worksheet's `source` is the repo-relative path,
// which the toolkit renders as each note's citation.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { segmentSource } from '../segment.js';
import { gatherVaultContext } from '../emit.js';
import { chunkCode } from './chunk.js';
import { DISTILL_METHODOLOGY, DISTILL_METHODOLOGY_CODE } from '../methodology.js';
import type { AtomizeEmitPlan, Segment, CortexConfig } from '../../types.js';

const CODE_CHUNK_CHARS = 24_000;

export function buildWorksheet(
  vaultDir: string,
  filePath: string,
  kind: 'doc' | 'code',
  config: CortexConfig,
): AtomizeEmitPlan {
  const text = readFileSync(join(vaultDir, filePath), 'utf8');
  const segments: Segment[] = kind === 'doc'
    ? segmentSource(text)
    : chunkCode(text, CODE_CHUNK_CHARS).map((body, i) => ({
        heading: `${filePath}${i > 0 ? ` (part ${i + 1})` : ''}`,
        level: 1,
        body,
      }));
  const { knownTypes, knownFolders, existing } = gatherVaultContext(vaultDir, config);
  return {
    source: filePath, // repo-relative path → citation
    sourcePath: join(vaultDir, filePath),
    lang: config.lang,
    fields: config.fields,
    statusFirst: config.statusLifecycle[0] ?? 'draft',
    knownTypes,
    knownFolders,
    existing,
    segments,
    instructions: kind === 'code' ? DISTILL_METHODOLOGY_CODE : DISTILL_METHODOLOGY,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/bootstrap-ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/bootstrap/ingest.ts toolkit/test/bootstrap-ingest.test.ts
git commit -m "feat(bootstrap): buildWorksheet routes code/doc into distillation worksheets"
```

---

### Task 7: `runBootstrap` — the orchestrator (CLI engine)

**Files:**
- Create: `toolkit/src/commands/bootstrap.ts`
- Test: `toolkit/test/bootstrap-run.test.ts`

**Interfaces:**
- Consumes: `discover` (Task 4), `buildWorksheet` (Task 6), `distillWorksheetWithLlm` (Task 3), `recordCreations` (`atomize/backup.js`), `loadConfig`, `collectFrontmatterKeys`, `LlmClient`.
- Produces:
  - `interface BootstrapResult { files: number; notes: number; skipped: number; failures: { path: string; error: string }[]; perFile: { path: string; notes: number }[]; dryRun: boolean; runId: string }`
  - `async function runBootstrap(root: string, client: LlmClient, opts?: { write?: boolean; force?: boolean; runId?: string }): Promise<BootstrapResult>`
  - `function formatBootstrap(r: BootstrapResult): string`

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/bootstrap-run.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrap } from '../src/commands/bootstrap.js';
import { undoLatestRun } from '../src/atomize/backup.js';
import type { LlmClient } from '../src/atomize/llm-client.js';

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-boot-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'src', 'b.ts'), 'export const b = 2;\n');
  return dir;
}

// A client that returns a valid note for a.ts and garbage for b.ts (to prove continue-on-error).
function pickyClient(): LlmClient {
  return {
    complete: async (_system: string, user: string) => {
      if (user.includes('a.ts')) return JSON.stringify({ source: 'x', notes: [{ title: 'Concept A', type: 'concept', folder: '01-Concepts', body: 'About a.' }] });
      return 'sorry, no json here';
    },
  };
}

describe('runBootstrap', () => {
  it('dry-runs by default — writes nothing', async () => {
    const dir = repo();
    const res = await runBootstrap(dir, pickyClient());
    expect(res.dryRun).toBe(true);
    expect(res.notes).toBe(0);
    expect(existsSync(join(dir, '_inbox'))).toBe(false);
  });

  it('continue-on-error: one bad file fails but the run completes and drafts the good ones', async () => {
    const dir = repo();
    const res = await runBootstrap(dir, pickyClient(), { write: true });
    expect(res.files).toBe(2);
    expect(res.notes).toBeGreaterThan(0);
    expect(res.failures.map(f => f.path)).toContain('src/b.ts'); // garbage → failure
    expect(res.failures.map(f => f.path)).not.toContain('src/a.ts');
  });

  it('one shared runId: cortex undo reverses ALL bootstrap drafts in one call', async () => {
    const dir = repo();
    // client that succeeds for BOTH files
    const good: LlmClient = { complete: async (_s, u) => JSON.stringify({ source: 'x', notes: [{ title: `N ${u.includes('a.ts') ? 'A' : 'B'}`, type: 'concept', folder: '01-Concepts', body: 'x' }] }) };
    const res = await runBootstrap(dir, good, { write: true });
    expect(res.notes).toBe(2);
    const { reverted } = undoLatestRun(dir);
    expect(reverted.length).toBe(2); // both drafts deleted by a single undo
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/bootstrap-run.test.ts`
Expected: FAIL — `Cannot find module '../src/commands/bootstrap.js'`.

- [ ] **Step 3: Implement `runBootstrap`**

Create `toolkit/src/commands/bootstrap.ts`:

```ts
// toolkit/src/commands/bootstrap.ts
//
// The CLI bootstrap engine: discover every eligible repo file, distill each
// into concept drafts, and journal the whole run under ONE shared runId so
// `cortex undo` reverses it in a single call. Continue-on-error — one bad file
// never aborts the run. Dry-run by default.

import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { discover } from '../atomize/bootstrap/discover.js';
import { buildWorksheet } from '../atomize/bootstrap/ingest.js';
import { distillWorksheetWithLlm } from '../atomize/distill-llm.js';
import { recordCreations } from '../atomize/backup.js';
import type { LlmClient } from '../atomize/llm-client.js';

export interface BootstrapResult {
  files: number;
  notes: number;
  skipped: number;
  failures: { path: string; error: string }[];
  perFile: { path: string; notes: number }[];
  dryRun: boolean;
  runId: string;
}

function makeRunId(): string {
  return `bootstrap-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

export async function runBootstrap(
  root: string,
  client: LlmClient,
  opts: { write?: boolean; force?: boolean; runId?: string } = {},
): Promise<BootstrapResult> {
  const write = opts.write ?? false;
  const runId = opts.runId ?? makeRunId();
  const config = loadConfig(root, collectFrontmatterKeys(root));
  const { files, skipped } = discover(root, config);

  const failures: { path: string; error: string }[] = [];
  const perFile: { path: string; notes: number }[] = [];
  const allCreated: string[] = [];

  for (const file of files) {
    try {
      const worksheet = buildWorksheet(root, file.path, file.kind, config);
      const res = await distillWorksheetWithLlm(root, worksheet, config, client, { write, force: opts.force, runId });
      perFile.push({ path: file.path, notes: res.written.length });
      allCreated.push(...res.written);
    } catch (e) {
      failures.push({ path: file.path, error: (e as Error).message });
    }
  }

  // Journal ALL created drafts under the one runId exactly once (recordCreations
  // overwrites its {runId}.json, so it must be called a single time).
  if (write && allCreated.length) recordCreations(root, allCreated, runId);

  return {
    files: files.length,
    notes: allCreated.length,
    skipped: skipped.length,
    failures,
    perFile,
    dryRun: !write,
    runId,
  };
}

export function formatBootstrap(r: BootstrapResult): string {
  const lines: string[] = [];
  lines.push(`Bootstrap: ${r.files} file(s) · ${r.notes} note(s) · ${r.skipped} skipped · ${r.failures.length} failed`);
  lines.push(r.dryRun ? '(dry-run — nothing written; pass --write to apply)' : `wrote ${r.notes} draft(s) to _inbox/`);
  for (const f of r.perFile) if (f.notes) lines.push(`  • ${f.path} → ${f.notes} note(s)`);
  for (const f of r.failures) lines.push(`  ✗ ${f.path}: ${f.error.split('\n')[0]}`);
  if (!r.dryRun && r.notes) lines.push('Next: open the graph with `cortex viz`  ·  undo the run with `cortex undo`');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/bootstrap-run.test.ts`
Expected: PASS (dry-run default, continue-on-error, single-undo).

- [ ] **Step 5: Run the full suite (integration surface touched)**

Run: `cd toolkit && npm test`
Expected: PASS (no regressions in emit/distill/atomize suites from Tasks 2–3).

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/commands/bootstrap.ts toolkit/test/bootstrap-run.test.ts
git commit -m "feat(bootstrap): runBootstrap orchestrator — one reversible run, continue-on-error"
```

---

### Task 8: CLI wiring + README

**Files:**
- Modify: `toolkit/src/cli.ts` (new `bootstrap` case; `USAGE` string)
- Test: `toolkit/test/bootstrap-cli.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `runBootstrap`, `formatBootstrap` (Task 7); `parseModelSpec`, `makeLlmClient` (existing, `atomize/llm-client.js`).
- Produces: a `bootstrap` command handled in `main(argv)`; behavior — no `--model` → usage error return 1; missing key → named-env-var error.

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/bootstrap-cli.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { main } from '../src/cli.js';

afterEach(() => vi.restoreAllMocks());

function captureLog(): string[] {
  const out: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
  return out;
}

describe('cortex bootstrap (CLI)', () => {
  it('errors with usage when --model is missing', async () => {
    const log = captureLog();
    const code = await main(['bootstrap', '.']);
    expect(code).toBe(1);
    expect(log.join('\n')).toMatch(/Usage: cortex bootstrap/);
  });

  it('surfaces the named env var when the key is missing', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const log = captureLog();
    const code = await main(['bootstrap', '.', '--model', 'anthropic:claude-x']);
    expect(code).toBe(1);
    expect(log.join('\n')).toMatch(/ANTHROPIC_API_KEY/);
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/bootstrap-cli.test.ts`
Expected: FAIL — `bootstrap` is an unknown command (falls through) or `main` doesn't return 1 with the usage text.

- [ ] **Step 3: Add the `bootstrap` case**

In `toolkit/src/cli.ts`, add the import (extend the existing `atomize/llm-client.js` usage — `parseModelSpec`/`makeLlmClient` may not be imported yet in cli.ts; add them):

```ts
import { parseModelSpec, makeLlmClient } from './atomize/llm-client.js';
import { runBootstrap, formatBootstrap } from './commands/bootstrap.js';
```

Add a `case 'bootstrap':` to the command switch (mirror the `atomize` flag parsing + guards):

```ts
    case 'bootstrap': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const force = rest.includes('--force');
      const mi = rest.indexOf('--model');
      const model = mi >= 0 ? rest[mi + 1] : undefined;
      const bi = rest.indexOf('--base-url');
      const baseUrl = bi >= 0 ? rest[bi + 1] : undefined;
      const usage = 'Usage: cortex bootstrap [path] --model <provider:model> [--base-url <url>] [--write]';
      if (mi < 0 || model === undefined || model.startsWith('--')) { console.log(usage); return 1; }
      if (bi >= 0 && (baseUrl === undefined || baseUrl.startsWith('--'))) { console.log(usage); return 1; }
      const flagValues = new Set([model, baseUrl].filter(Boolean) as string[]);
      const root = rest.find(a => !a.startsWith('--') && !flagValues.has(a)) ?? '.';
      try {
        const spec = parseModelSpec(model);
        if (baseUrl) spec.baseUrl = baseUrl;
        const client = makeLlmClient(spec, process.env);
        console.log(formatBootstrap(await runBootstrap(root, client, { write, force })));
        return 0;
      } catch (e) {
        console.log((e as Error).message);
        return 1;
      }
    }
```

Update the `USAGE` string near the top of `cli.ts` to include `bootstrap` in the command list.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd toolkit && npx vitest run test/bootstrap-cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Build + no-network smoke check**

Run: `cd toolkit && npm run build`
Expected: clean tsc build.

Run (no `ANTHROPIC_API_KEY` set): `cd toolkit && node dist/cli.js bootstrap . --model anthropic:claude-x`
Expected: prints `Missing ANTHROPIC_API_KEY environment variable`, exits 1 — proving the command routes before any network call.

- [ ] **Step 6: Update the README**

In `README.md`, near the atomize / BYO-key section, add:

```markdown
### Bootstrap an undocumented repo

Point Cortex at a codebase with no docs and it reads every file — code included —
and distills the project's concepts into connected atomic notes:

    export ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY
    cortex bootstrap . --model anthropic:claude-3-5-sonnet --write

It respects `.gitignore`, skips binaries and vendored folders, streams progress
per file, and writes `status: draft` notes into `_inbox/`. Dry-run by default —
run without `--write` to preview the file manifest first. The whole run is one
reversible unit: `cortex undo` reverses the entire bootstrap. Then open the
graph with `cortex viz`. Works with any OpenAI-compatible endpoint too
(`--model openai-compat:llama3 --base-url http://localhost:11434/v1`).
```

- [ ] **Step 7: Run the full suite**

Run: `cd toolkit && npm test`
Expected: PASS (all files).

- [ ] **Step 8: Commit**

```bash
git add toolkit/src/cli.ts toolkit/test/bootstrap-cli.test.ts README.md
git commit -m "feat(bootstrap): cortex bootstrap CLI command + README"
```

---

### Task 9: MCP driver — `cortex_bootstrap_plan` + `cortex_bootstrap_emit`

**Files:**
- Create: `toolkit/src/mcp/tools-bootstrap.ts`
- Modify: `toolkit/src/mcp/server.ts` (register the two read tools under a write scope)
- Test: `toolkit/test/mcp-bootstrap.test.ts`

**Interfaces:**
- Consumes: `discover` (Task 4), `buildWorksheet` (Task 6), `loadConfig`, `collectFrontmatterKeys`.
- Produces:
  - `function bootstrapPlanTool(vaultDir: string): DiscoverResult`
  - `function bootstrapEmitTool(vaultDir: string, args: { path: string; kind: 'doc' | 'code' }): AtomizeEmitPlan`

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/mcp-bootstrap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapPlanTool, bootstrapEmitTool } from '../src/mcp/tools-bootstrap.js';
import { DISTILL_METHODOLOGY_CODE } from '../src/atomize/methodology.js';

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-mcpboot-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  return dir;
}

describe('bootstrap MCP tools', () => {
  it('bootstrap_plan returns the manifest', () => {
    const dir = repo();
    const plan = bootstrapPlanTool(dir);
    expect(plan.files.some(f => f.path === 'src/a.ts' && f.kind === 'code')).toBe(true);
  });
  it('bootstrap_emit returns the code worksheet for one file', () => {
    const dir = repo();
    const w = bootstrapEmitTool(dir, { path: 'src/a.ts', kind: 'code' });
    expect(w.source).toBe('src/a.ts');
    expect(w.instructions).toBe(DISTILL_METHODOLOGY_CODE);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/mcp-bootstrap.test.ts`
Expected: FAIL — `Cannot find module '../src/mcp/tools-bootstrap.js'`.

- [ ] **Step 3: Implement the tool functions**

Create `toolkit/src/mcp/tools-bootstrap.ts`:

```ts
// toolkit/src/mcp/tools-bootstrap.ts
//
// The bootstrap read-companions for the MCP agent driver. The agent calls
// bootstrap_plan to get the file manifest, then bootstrap_emit per file to get
// the distillation worksheet, distills with its own model, and writes via the
// existing cortex_atomize_apply. Pure reads — no writes here.

import { resolve, sep } from 'node:path';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { discover, type DiscoverResult } from '../atomize/bootstrap/discover.js';
import { buildWorksheet } from '../atomize/bootstrap/ingest.js';
import type { AtomizeEmitPlan } from '../types.js';

function cfg(vaultDir: string) {
  return loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
}

/** Reject a path that escapes the vault. */
function assertInVault(vaultDir: string, rel: string): void {
  const abs = resolve(vaultDir, rel);
  const root = resolve(vaultDir);
  if (abs !== root && !abs.startsWith(root + sep)) throw new Error(`path escapes the vault: ${rel}`);
}

/** The repo manifest: which files an agent should distill. */
export function bootstrapPlanTool(vaultDir: string): DiscoverResult {
  return discover(vaultDir, cfg(vaultDir));
}

/** The distillation worksheet for one repo file (doc or code). */
export function bootstrapEmitTool(vaultDir: string, args: { path: string; kind: 'doc' | 'code' }): AtomizeEmitPlan {
  assertInVault(vaultDir, args.path);
  return buildWorksheet(vaultDir, args.path, args.kind, cfg(vaultDir));
}
```

- [ ] **Step 4: Register the tools in the MCP server**

In `toolkit/src/mcp/server.ts`, add the import near the other tool imports:

```ts
import { bootstrapPlanTool, bootstrapEmitTool } from './tools-bootstrap.js';
```

Then, inside the write-scope section (after the `cortex_gaps` registration, before the draft-scope write tools), register the two read companions:

```ts
  server.registerTool(
    'cortex_bootstrap_plan',
    {
      title: 'Cortex bootstrap — plan',
      description: 'Walk the repo and return the manifest of files to distill (code + docs), respecting .gitignore and skipping binaries/vendored. Read-only. Iterate it, then call cortex_bootstrap_emit per file.',
      inputSchema: {},
    },
    async () => {
      try { return json(bootstrapPlanTool(vaultDir)); } catch (e) { return fail(e); }
    },
  );

  server.registerTool(
    'cortex_bootstrap_emit',
    {
      title: 'Cortex bootstrap — emit worksheet',
      description: 'Return the distillation worksheet for one repo file (from cortex_bootstrap_plan). Follow its `instructions` field to distill, then write with cortex_atomize_apply. Read-only.',
      inputSchema: {
        path: z.string().describe('Repo-relative file path from the bootstrap plan'),
        kind: z.enum(['doc', 'code']).describe('The file kind reported by the plan'),
      },
    },
    async ({ path, kind }) => {
      try { return json(bootstrapEmitTool(vaultDir, { path, kind })); } catch (e) { return fail(e); }
    },
  );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd toolkit && npx vitest run test/mcp-bootstrap.test.ts test/mcp-server.test.ts`
Expected: PASS (the tool functions work; the server still builds and registers).

- [ ] **Step 6: Build + full suite**

Run: `cd toolkit && npm run build && npm test`
Expected: clean build, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/mcp/tools-bootstrap.ts toolkit/src/mcp/server.ts toolkit/test/mcp-bootstrap.test.ts
git commit -m "feat(bootstrap): MCP driver — cortex_bootstrap_plan + cortex_bootstrap_emit"
```

---

## Verification (whole feature)

- [ ] `cd toolkit && npm test` — every suite green.
- [ ] `cd toolkit && npm run build` — clean tsc build.
- [ ] `node dist/cli.js bootstrap . --model anthropic:claude-x` with no key → `Missing ANTHROPIC_API_KEY`, exit 1 (routing works, no network).
- [ ] **Manual (out-of-band, needs keys/models):** run `cortex bootstrap <small-repo> --model anthropic:<model> --write` on a real small repo and with `--model openai-compat:<local> --base-url …`; confirm concept notes are coherent and connected, `cortex viz` shows the project graph, and `cortex undo` reverses the whole run. Register `cortex mcp --write=draft` and have an agent drive `cortex_bootstrap_plan` → `cortex_bootstrap_emit` → distill → `cortex_atomize_apply`.
- [ ] Confirm README documents `cortex bootstrap` before opening the PR (repo convention).
```
