# Cortex Atomize 3.2 (the `update` action) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `update` action to `atomize` — when the AI agent decides a distilled note should merge into an existing note, the toolkit edits that note **in place**, autonomously and **reversibly** (per-run backups + `--undo`), with a conservative frontmatter-safe merge and a shrink guard.

**Architecture:** Builds on Phase 3.1's two-seam model (toolkit = deterministic engine; `/atomize` skill = AI layer). The agent reads the matched existing note and emits an `action:"update"` item with the merged body; the toolkit validates the target, backs it up, and writes the merged body in place. Sources stay immutable; every edit is undoable.

**Tech Stack:** Node ≥ 20, TypeScript (ESM), vitest. `gray-matter` is already a dependency (used by `parseFrontmatter`). No new dependencies.

## Global Constraints

- **Builds on Phase 3/3.1** (`toolkit/`): reuse `loadConfig`, `scanVault`, `collectFrontmatterKeys`, `parseFrontmatter`, `slug`, `reconcile`, `renderNote`, `applyAtomize`, and the existing atomize types.
- **ESM** (`.js` import extensions), Node ≥ 20. Tool language English. Package root `toolkit/`.
- **WRITE-SAFETY for `update` (the headline):**
  - **Reversible.** Before editing any existing note, copy it to `.cortex/backups/<runId>/<vault-relative-path>` (dot-prefixed → `scanVault` never indexes it). `atomize --undo` restores the most recent backup set.
  - **Frontmatter-safe.** An update keeps the existing YAML frontmatter block **verbatim**; only the body is replaced with the agent's merged body. No YAML re-serialization.
  - **Sources immutable.** A target under `config.sourcesDir` (`Markdown/`) is hard-blocked. Targets must resolve **inside the vault** and **already exist** (update never creates files).
  - **Shrink guard.** Skip an update whose merged body is `< 50%` of the existing body length, unless `--force`.
  - **Dry-run by default.** On dry-run nothing is written and **no backup is taken**; `--write` applies.
  - **Idempotent.** Re-running yields `skip`/no-op once the note already carries the info (the agent's call).
  - **Create path unchanged.** `create` items still go only to `_inbox/<folder>/<id>.md` with the existing reconcile, de-collision, and resolved-path `_inbox/` confinement.
- **Tests:** TDD for every module; the update path is tested against a temp vault and asserts dry-run writes nothing and creates no backup.

---

## File Structure

```
toolkit/
├── src/types.ts                  — DistilledNote.action/targetPath; DistilledApplyResult (modify)
├── src/atomize/
│   ├── backup.ts                 — backupNote / restoreLatestBackup (new)
│   ├── render.ts                 — renderUpdatedNote (modify)
│   └── apply-distilled.ts        — update path (validate → shrink-guard → backup → in-place write) (modify)
├── src/commands/atomize.ts       — runApply(force), runUndo, formatDistilledPlan (modify)
├── src/cli.ts                    — --force / --undo wiring (modify)
├── skills/atomize/SKILL.md       — update intent + conservative-merge + auto-apply UX (modify)
└── test/
    ├── backup.test.ts            — (new)
    ├── render.test.ts            — renderUpdatedNote (modify)
    └── apply-distilled.test.ts   — update path + safety (modify)
```

---

### Task 1: types + `renderUpdatedNote`

**Files:**
- Modify: `toolkit/src/types.ts` (extend `DistilledNote`; add `DistilledApplyResult`)
- Modify: `toolkit/src/atomize/render.ts` (add `renderUpdatedNote`)
- Modify: `toolkit/test/render.test.ts` (add tests)

**Interfaces:**
- Consumes: `NoteSpec`, `AtomizePlan` (types.js).
- Produces:
  `DistilledNote` gains `action?: 'create' | 'update'` and `targetPath?: string`;
  `DistilledApplyResult { plan: AtomizePlan; written: string[]; updated: string[]; backups: string[]; skipped: { target: string; reason: string }[] }`;
  `renderUpdatedNote(existingContent: string, mergedBody: string, source: string): string` — keeps the existing frontmatter block verbatim, replaces the body with `mergedBody` (which already includes the note's `# Heading`), and appends a `*Source: [[source]]*` line only if that exact `[[source]]` link is not already in `mergedBody`.

- [ ] **Step 1: Extend the types in `types.ts`**

Find the existing `DistilledNote` interface (added in 3.1) and add the two optional fields:

```ts
export interface DistilledNote {
  title: string;
  type?: string | null;
  folder?: string | null;
  tags?: string[];
  body: string;
  fromHeading?: string;
  action?: 'create' | 'update';
  targetPath?: string;
}
```

Then append, right after the `DistilledInput` interface:

```ts
export interface DistilledApplyResult {
  plan: AtomizePlan;
  written: string[];
  updated: string[];
  backups: string[];
  skipped: { target: string; reason: string }[];
}
```

- [ ] **Step 2: Write the failing test**

Add to `toolkit/test/render.test.ts`:

```ts
import { renderUpdatedNote } from '../src/atomize/render.js';

describe('renderUpdatedNote', () => {
  const existing = '---\ntype: concept\nid: x\ncustom: keep-me\n---\n# Title\n\nold body\n\n*Source: [[a]]*\n';

  it('keeps the frontmatter block verbatim and replaces the body', () => {
    const out = renderUpdatedNote(existing, '# Title\n\nmerged body', 'a');
    expect(out).toMatch(/^---\ntype: concept\nid: x\ncustom: keep-me\n---/); // frontmatter byte-stable
    expect(out).toContain('merged body');
    expect(out).not.toContain('old body');
  });

  it('appends the source citation only when the merged body lacks it', () => {
    const without = renderUpdatedNote(existing, '# Title\n\nmerged body', 'b');
    expect(without).toContain('*Source: [[b]]*');                       // new source appended
    const withIt = renderUpdatedNote(existing, '# Title\n\nbody cites [[b]] already', 'b');
    expect(withIt.match(/\[\[b\]\]/g)?.length).toBe(1);                 // not duplicated
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd toolkit && npm test -- render`
Expected: FAIL — `renderUpdatedNote` is not exported from `render.js`.

- [ ] **Step 4: Implement `renderUpdatedNote`**

Append to `toolkit/src/atomize/render.ts`:

```ts
export function renderUpdatedNote(existingContent: string, mergedBody: string, source: string): string {
  const m = existingContent.match(/^---\n[\s\S]*?\n---\n?/);
  const frontmatter = (m ? m[0] : '').replace(/\n+$/, ''); // verbatim block, trailing newlines normalized
  const body = mergedBody.trim();
  const parts = [frontmatter, '', body, ''];
  if (!body.includes(`[[${source}]]`)) parts.push(`*Source: [[${source}]]*`, '');
  return parts.join('\n');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- render`
Expected: PASS (all render tests).

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/types.ts toolkit/src/atomize/render.ts toolkit/test/render.test.ts
git commit -m "feat(toolkit): atomize 3.2 update types + renderUpdatedNote"
```

---

### Task 2: `backup.ts` — reversibility

**Files:**
- Create: `toolkit/src/atomize/backup.ts`
- Test: `toolkit/test/backup.test.ts`

**Interfaces:**
- Produces:
  `backupNote(vaultDir: string, relPath: string, runId: string): string` — copies `<vaultDir>/<relPath>` to `<vaultDir>/.cortex/backups/<runId>/<relPath>`, creating dirs; returns the backup's vault-relative path.
  `restoreLatestBackup(vaultDir: string): { restored: string[] }` — finds the lexicographically-greatest `runId` dir under `.cortex/backups/`, copies every file in it back over its original vault location; returns the restored vault-relative paths (sorted). Returns `{ restored: [] }` when there are no backups.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/backup.test.ts
import { describe, it, expect } from 'vitest';
import { backupNote, restoreLatestBackup } from '../src/atomize/backup.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-bak-'));
  mkdirSync(join(dir, '01-Concepts'));
  writeFileSync(join(dir, '01-Concepts', 'n.md'), 'original content');
  return dir;
}

describe('backupNote / restoreLatestBackup', () => {
  it('backs up a note under .cortex/backups/<runId>/ and restores it', () => {
    const dir = vault();
    const rel = '01-Concepts/n.md';
    const bak = backupNote(dir, rel, '2026-01-01T00-00-00');
    expect(bak).toBe('.cortex/backups/2026-01-01T00-00-00/01-Concepts/n.md');
    expect(readFileSync(join(dir, bak), 'utf8')).toBe('original content');

    // mutate, then restore
    writeFileSync(join(dir, rel), 'EDITED');
    const { restored } = restoreLatestBackup(dir);
    expect(restored).toEqual(['01-Concepts/n.md']);
    expect(readFileSync(join(dir, rel), 'utf8')).toBe('original content');
  });

  it('restores the newest backup set and returns [] when none exist', () => {
    const dir = vault();
    expect(restoreLatestBackup(dir)).toEqual({ restored: [] });
    backupNote(dir, '01-Concepts/n.md', '2026-01-01T00-00-00');
    writeFileSync(join(dir, '01-Concepts', 'n.md'), 'v2');
    backupNote(dir, '01-Concepts/n.md', '2026-02-02T00-00-00'); // newer runId backs up 'v2'
    writeFileSync(join(dir, '01-Concepts', 'n.md'), 'v3');
    restoreLatestBackup(dir);
    expect(readFileSync(join(dir, '01-Concepts', 'n.md'), 'utf8')).toBe('v2'); // newest set wins
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- backup`
Expected: FAIL — cannot find module `../src/atomize/backup.js`.

- [ ] **Step 3: Implement `backup.ts`**

```ts
// toolkit/src/atomize/backup.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

const BACKUP_ROOT = '.cortex/backups';

export function backupNote(vaultDir: string, relPath: string, runId: string): string {
  const bakRel = `${BACKUP_ROOT}/${runId}/${relPath}`;
  const abs = join(vaultDir, bakRel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, readFileSync(join(vaultDir, relPath)));
  return bakRel;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function restoreLatestBackup(vaultDir: string): { restored: string[] } {
  const root = join(vaultDir, BACKUP_ROOT);
  if (!existsSync(root)) return { restored: [] };
  const runs = readdirSync(root).filter(r => statSync(join(root, r)).isDirectory()).sort();
  if (runs.length === 0) return { restored: [] };
  const latest = join(root, runs[runs.length - 1]); // lexicographically greatest runId
  const restored: string[] = [];
  for (const file of walk(latest)) {
    const rel = relative(latest, file).split(sep).join('/');
    writeFileSync(join(vaultDir, rel), readFileSync(file));
    restored.push(rel);
  }
  return { restored: restored.sort() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- backup`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/backup.ts toolkit/test/backup.test.ts
git commit -m "feat(toolkit): per-run note backups + restore (reversibility)"
```

---

### Task 3: `applyDistilled` — the update path (safety core)

**Files:**
- Modify: `toolkit/src/atomize/apply-distilled.ts`
- Modify: `toolkit/test/apply-distilled.test.ts`

**Interfaces:**
- Consumes: `slug`, `reconcile`, `scanVault`, `applyAtomize`, `parseFrontmatter`, `backupNote` (+ `renderUpdatedNote` from render.js), `DistilledInput`, `DistilledApplyResult`, `NoteSpec`, `AtomizePlanItem`, `AtomizePlan`, `CortexConfig` (types.js).
- Produces: `applyDistilled(vaultDir, specsPath, config, opts?: { dryRun?: boolean; force?: boolean; runId?: string }): DistilledApplyResult` — `create` items behave exactly as in 3.1; `update` items (`action:'update'`) are validated, shrink-guarded, backed up, and written in place (only when `dryRun === false`). Skips are reported in `skipped` with a reason (`outside-vault` | `source-immutable` | `not-found` | `shrink-guard`).

- [ ] **Step 1: Write the failing test**

Add to `toolkit/test/apply-distilled.test.ts` (the file already imports `mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync` from `node:fs`, `tmpdir`, `join`, `loadConfig`, `applyDistilled`, and `DistilledInput`):

```ts
function updVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-upd-'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '01-Concepts'));
  writeFileSync(join(dir, '01-Concepts', 'limit.md'),
    '---\ntype: concept\nid: limit\n---\n# Operation limit\n\nThe limit is 5.\n\n*Source: [[old]]*\n');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# ignored');
  return dir;
}
function specs(dir: string, input: DistilledInput): string {
  const p = join(dir, 'd.json'); writeFileSync(p, JSON.stringify(input)); return p;
}
const upd: DistilledInput = { source: 'rules', notes: [
  { title: 'Operation limit', action: 'update', targetPath: '01-Concepts/limit.md',
    body: '# Operation limit\n\nThe limit is 5, raised to 8 in 2026.\n\n*Source: [[old]]*' },
]};

describe('applyDistilled — update action', () => {
  it('dry-runs by default: no write, no backup', () => {
    const dir = updVault();
    const r = applyDistilled(dir, specs(dir, upd), loadConfig(dir, []), { dryRun: true });
    expect(r.updated).toEqual([]);
    expect(r.backups).toEqual([]);
    expect(existsSync(join(dir, '.cortex'))).toBe(false);
    expect(readFileSync(join(dir, '01-Concepts', 'limit.md'), 'utf8')).toContain('The limit is 5.');
  });

  it('with --write: backs up then merges in place (frontmatter preserved)', () => {
    const dir = updVault();
    const r = applyDistilled(dir, specs(dir, upd), loadConfig(dir, []), { dryRun: false, runId: 'RUN1' });
    expect(r.updated).toEqual(['01-Concepts/limit.md']);
    expect(r.backups).toEqual(['.cortex/backups/RUN1/01-Concepts/limit.md']);
    const after = readFileSync(join(dir, '01-Concepts', 'limit.md'), 'utf8');
    expect(after).toMatch(/^---\ntype: concept\nid: limit\n---/); // frontmatter verbatim
    expect(after).toContain('raised to 8 in 2026');
    // backup holds the original
    expect(readFileSync(join(dir, '.cortex/backups/RUN1/01-Concepts/limit.md'), 'utf8')).toContain('The limit is 5.\n');
  });

  it('hard-blocks a Markdown/ target, a missing target, and a traversal target', () => {
    const dir = updVault();
    const bad: DistilledInput = { source: 'rules', notes: [
      { title: 'X', action: 'update', targetPath: 'Markdown/src.md', body: '# X\n\nlots of new text here to pass shrink' },
      { title: 'Y', action: 'update', targetPath: '01-Concepts/missing.md', body: '# Y\n\nnew' },
      { title: 'Z', action: 'update', targetPath: '../escape.md', body: '# Z\n\nnew' },
    ]};
    const r = applyDistilled(dir, specs(dir, bad), loadConfig(dir, []), { dryRun: false, runId: 'RUN2' });
    expect(r.updated).toEqual([]);
    expect(r.skipped.map(s => s.reason).sort()).toEqual(['not-found', 'outside-vault', 'source-immutable']);
    expect(readFileSync(join(dir, 'Markdown', 'src.md'), 'utf8')).toBe('# ignored'); // source untouched
    expect(existsSync(join(dir, '..', 'escape.md'))).toBe(false);
  });

  it('shrink guard skips a destructive update unless forced', () => {
    const dir = updVault();
    const tiny: DistilledInput = { source: 'rules', notes: [
      { title: 'Operation limit', action: 'update', targetPath: '01-Concepts/limit.md', body: '# x' },
    ]};
    const guarded = applyDistilled(dir, specs(dir, tiny), loadConfig(dir, []), { dryRun: false, runId: 'RUN3' });
    expect(guarded.updated).toEqual([]);
    expect(guarded.skipped).toEqual([{ target: '01-Concepts/limit.md', reason: 'shrink-guard' }]);
    const forced = applyDistilled(dir, specs(dir, tiny), loadConfig(dir, []), { dryRun: false, force: true, runId: 'RUN4' });
    expect(forced.updated).toEqual(['01-Concepts/limit.md']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- apply-distilled`
Expected: FAIL — `applyDistilled` does not handle `action:'update'` (no `updated`/`backups`/`skipped` in the result).

- [ ] **Step 3: Rewrite `apply-distilled.ts`**

```ts
// toolkit/src/atomize/apply-distilled.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { slug } from './propose.js';
import { reconcile } from './reconcile.js';
import { scanVault } from '../vault.js';
import { applyAtomize } from './plan.js';
import { renderUpdatedNote } from './render.js';
import { backupNote } from './backup.js';
import { parseFrontmatter } from '../frontmatter.js';
import type { AtomizePlan, AtomizePlanItem, DistilledInput, DistilledApplyResult, NoteSpec, CortexConfig } from '../types.js';

const INBOX = '_inbox';

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function applyDistilled(
  vaultDir: string,
  specsPath: string,
  config: CortexConfig,
  opts: { dryRun?: boolean; force?: boolean; runId?: string } = {},
): DistilledApplyResult {
  const dryRun = opts.dryRun ?? true;
  const force = opts.force ?? false;
  const runId = opts.runId ?? makeRunId();
  const input = JSON.parse(readFileSync(specsPath, 'utf8')) as DistilledInput;
  const existing = scanVault(vaultDir, config);
  const status = config.statusLifecycle[0] ?? 'draft';
  const sourcesDir = config.sourcesDir.replace(/\/$/, '');
  const vaultAbs = resolve(vaultDir);

  // ── create items: unchanged 3.1 behavior ──────────────────────────
  const usedPaths = new Set<string>();
  const createItems: AtomizePlanItem[] = input.notes
    .filter(n => (n.action ?? 'create') === 'create')
    .map(n => {
      const safeFolder = (n.folder && !n.folder.startsWith('/') && !n.folder.split('/').includes('..')) ? n.folder : null;
      const spec: NoteSpec = {
        id: slug(n.title), title: n.title, type: n.type ?? null, body: n.body,
        source: input.source, status, folder: safeFolder, tags: n.tags,
      };
      const folderPrefix = safeFolder ? `${safeFolder}/` : '';
      const { action, matchPath } = reconcile(spec, existing);
      if (action !== 'create') return { spec, action, matchPath, destPath: `${INBOX}/${folderPrefix}${spec.id}.md` };
      const baseId = spec.id.trim() === '' ? 'note' : spec.id;
      let finalId = baseId;
      let candidatePath = `${INBOX}/${folderPrefix}${finalId}.md`;
      let counter = 2;
      while (usedPaths.has(candidatePath)) { finalId = `${baseId}-${counter}`; candidatePath = `${INBOX}/${folderPrefix}${finalId}.md`; counter++; }
      usedPaths.add(candidatePath);
      return { spec: { ...spec, id: finalId }, action, matchPath, destPath: candidatePath };
    });

  // ── update items: validate → shrink-guard → backup → in-place write ──
  const updated: string[] = [];
  const backups: string[] = [];
  const skipped: { target: string; reason: string }[] = [];
  const updateItems: AtomizePlanItem[] = [];

  for (const n of input.notes.filter(n => n.action === 'update')) {
    const target = n.targetPath ?? '';
    const abs = resolve(vaultDir, target);
    const inVault = abs === vaultAbs || abs.startsWith(vaultAbs + sep);
    if (!target || !inVault) { skipped.push({ target, reason: 'outside-vault' }); continue; }
    if (target === sourcesDir || target.startsWith(`${sourcesDir}/`)) { skipped.push({ target, reason: 'source-immutable' }); continue; }
    if (!existsSync(abs)) { skipped.push({ target, reason: 'not-found' }); continue; }

    const existingContent = readFileSync(abs, 'utf8');
    const existingBody = parseFrontmatter(existingContent).body.trim();
    if (!force && n.body.trim().length < existingBody.length * 0.5) { skipped.push({ target, reason: 'shrink-guard' }); continue; }

    updateItems.push({
      spec: { id: '', title: n.title, type: n.type ?? null, body: n.body, source: input.source, status, folder: null, tags: n.tags },
      action: 'update', matchPath: target, destPath: target,
    });
    if (!dryRun) {
      backups.push(backupNote(vaultDir, target, runId));
      writeFileSync(abs, renderUpdatedNote(existingContent, n.body, input.source));
      updated.push(target);
    }
  }

  const plan: AtomizePlan = { source: input.source, items: [...createItems, ...updateItems], dryRun };
  const { written } = applyAtomize(vaultDir, plan); // writes only create items; ignores update items
  return { plan, written, updated, backups, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- apply-distilled`
Expected: PASS (existing 3.1 create tests + the 4 new update tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/apply-distilled.ts toolkit/test/apply-distilled.test.ts
git commit -m "feat(toolkit): atomize update action — reversible in-place merge"
```

---

### Task 4: command + CLI (`--force`, `--undo`)

**Files:**
- Modify: `toolkit/src/commands/atomize.ts` (`runApply` force, `runUndo`, `formatDistilledPlan`)
- Modify: `toolkit/src/cli.ts` (parse `--force`, `--undo`)
- Modify: `toolkit/test/atomize.test.ts`

**Interfaces:**
- Consumes: `applyDistilled`, `restoreLatestBackup` (backup.js), `DistilledApplyResult`.
- Produces:
  - `runApply(vaultDir, specsPath, opts: { write?: boolean; force?: boolean }): DistilledApplyResult`.
  - `runUndo(vaultDir: string): { restored: string[] }`.
  - `formatDistilledPlan(r: DistilledApplyResult): string` — now also lists `update → <target>` items and a `skipped` summary line.

- [ ] **Step 1: Write the failing test**

Add to `toolkit/test/atomize.test.ts`:

```ts
import { runUndo } from '../src/commands/atomize.js';

describe('runApply update + runUndo', () => {
  it('applies an update with --write and undoes it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-updcmd-'));
    mkdirSync(join(dir, '01-Concepts'));
    const note = join(dir, '01-Concepts', 'n.md');
    writeFileSync(note, '---\ntype: concept\nid: n\n---\n# N\n\norig body long enough\n');
    const specs = join(dir, 'd.json');
    writeFileSync(specs, JSON.stringify({ source: 'src', notes: [
      { title: 'N', action: 'update', targetPath: '01-Concepts/n.md', body: '# N\n\norig body long enough, plus new info added' },
    ]}));

    const r = runApply(dir, specs, { write: true });
    expect(r.updated).toEqual(['01-Concepts/n.md']);
    expect(readFileSync(note, 'utf8')).toContain('plus new info added');
    expect(formatDistilledPlan(r)).toMatch(/update →/);

    const undo = runUndo(dir);
    expect(undo.restored).toEqual(['01-Concepts/n.md']);
    expect(readFileSync(note, 'utf8')).toContain('orig body long enough');
    expect(readFileSync(note, 'utf8')).not.toContain('plus new info added');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- atomize`
Expected: FAIL — `runUndo` is not exported; `formatDistilledPlan` doesn't emit `update →`.

- [ ] **Step 3: Update `commands/atomize.ts`**

Add the import and update/extend the three functions (keep `runAtomize`/`formatPlan`/`runEmit` unchanged):

```ts
// add to the imports at the top:
import { restoreLatestBackup } from '../atomize/backup.js';
import type { DistilledApplyResult } from '../types.js';

// replace runApply:
export function runApply(vaultDir: string, specsPath: string, opts: { write?: boolean; force?: boolean }): DistilledApplyResult {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return applyDistilled(vaultDir, specsPath, config, { dryRun: !opts.write, force: opts.force });
}

// add runUndo:
export function runUndo(vaultDir: string): { restored: string[] } {
  return restoreLatestBackup(vaultDir);
}

// replace formatDistilledPlan:
export function formatDistilledPlan(r: DistilledApplyResult): string {
  const lines: string[] = [];
  const creates = r.plan.items.filter(i => i.action === 'create').length;
  const updates = r.plan.items.filter(i => i.action === 'update').length;
  const skips = r.plan.items.filter(i => i.action === 'skip').length;
  lines.push(`Distilled: ${r.plan.source}  ·  ${r.plan.items.length} note(s)  ·  ${creates} create · ${updates} update · ${skips} skip`);
  lines.push(r.plan.dryRun
    ? '(dry-run — nothing written; pass --write to apply)'
    : `wrote ${r.written.length} draft(s), updated ${r.updated.length} note(s)`);
  for (const i of r.plan.items) {
    const tag = i.action === 'skip' ? `skip (exists: ${i.matchPath})`
      : i.action === 'update' ? `update → ${i.destPath}`
      : `create → ${i.destPath}`;
    lines.push(`  • ${i.spec.title}  [${i.spec.type ?? 'untyped'}]  [${tag}]`);
  }
  if (r.skipped.length) lines.push(`Skipped (not applied): ${r.skipped.map(s => `${s.target} (${s.reason})`).join(', ')}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Wire the CLI flags**

In `toolkit/src/cli.ts`, replace the `atomize` case with:

```ts
    case 'atomize': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const force = rest.includes('--force');
      const emit = rest.includes('--emit-json');
      const apply = rest.includes('--apply');
      const undo = rest.includes('--undo');
      const positional = rest.filter(a => !a.startsWith('--'));
      if (undo) {
        const { restored } = runUndo(cwd);
        console.log(restored.length ? `Restored ${restored.length} note(s):\n  ${restored.join('\n  ')}` : 'No backups to restore.');
        return 0;
      }
      if (apply) {
        const specs = positional[0];
        if (!specs) { console.log('Usage: cortex atomize --apply <specs.json> [--write] [--force]'); return 1; }
        console.log(formatDistilledPlan(runApply(cwd, specs, { write, force })));
        return 0;
      }
      const source = positional[0];
      if (!source) { console.log('Usage: cortex atomize <source.md> [--emit-json | --write]'); return 1; }
      if (emit) { console.log(runEmit(cwd, source)); return 0; }
      console.log(formatPlan(runAtomize(cwd, source, { write })));
      return 0;
    }
```

Update the import line in `cli.ts`:

```ts
import { runAtomize, formatPlan, runEmit, runApply, formatDistilledPlan, runUndo } from './commands/atomize.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- atomize`
Expected: PASS (existing atomize tests + the new update/undo test).

- [ ] **Step 6: Full suite + build + temp-vault smoke**

Run: `cd toolkit && npm test` (all green), then `npm run build`.
Then a throwaway smoke (do NOT touch the repo tree):

```bash
D=$(mktemp -d); mkdir -p "$D/01-Concepts" "$D/Markdown"
printf -- '---\ntype: concept\nid: limit\n---\n# Operation limit\n\nThe limit is 5.\n' > "$D/01-Concepts/limit.md"
CLI="/Users/wagnersebastian/Documents/0. WSDC Tech/4. N1X/n1x-cortex/toolkit/dist/cli.js"
printf '{"source":"rules","notes":[{"title":"Operation limit","action":"update","targetPath":"01-Concepts/limit.md","body":"# Operation limit\\n\\nThe limit is 5, raised to 8 in 2026."}]}' > "$D/d.json"
(cd "$D" && node "$CLI" atomize --apply d.json)            # dry-run: prints "update →", writes nothing
grep -q "raised to 8" "$D/01-Concepts/limit.md" && echo "DRYRUN BUG: wrote" || echo "OK dry-run wrote nothing"
(cd "$D" && node "$CLI" atomize --apply d.json --write)    # backs up + merges in place
grep -q "raised to 8" "$D/01-Concepts/limit.md" && echo "OK updated in place"
test -d "$D/.cortex/backups" && echo "OK backup created"
(cd "$D" && node "$CLI" atomize --undo)                    # restores original
grep -q "raised to 8" "$D/01-Concepts/limit.md" && echo "UNDO BUG" || echo "OK undo restored original"
```
Expected: dry-run writes nothing; `--write` merges in place + creates a backup; `--undo` restores the original.

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/commands/atomize.ts toolkit/src/cli.ts toolkit/test/atomize.test.ts
git commit -m "feat(toolkit): atomize --force and --undo; report updates in the plan"
```

---

### Task 5: the `/atomize` skill + docs

**Files:**
- Modify: `toolkit/skills/atomize/SKILL.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes (at runtime): `cortex atomize --apply <specs.json> --write [--force]` and `cortex atomize --undo` from Task 4.
- Produces: prose only (no exported code). Verification = structural grep + manual smoke (Task 4's smoke already exercises the CLI).

- [ ] **Step 1: Add the update procedure to the skill**

In `toolkit/skills/atomize/SKILL.md`, add an `action`/`update` rule inside the distillation list (Step 3) and switch the apply/UX steps to auto-apply. Add this bullet to the Step 3 list (after the "No duplicates" bullet):

```markdown
   - **Update vs create vs skip.** For a segment that matches a note in `existing` *and adds information*: **read that note** (its `path`), produce a **conservative merged body** — integrate the new info, preserve ALL existing content, links, and human edits, keep every source citation and add the new one, and keep the note's `# Heading` — then emit it as `{ "action": "update", "targetPath": "<existing path>", "title", "body": "<full merged body incl. heading>" }`. If the existing note already covers the segment, leave it `skip` (don't churn). Only `create` (new) notes omit `action`/`targetPath`.
```

Replace Steps 5–6 (preview/apply) with an auto-apply flow:

```markdown
5. **Apply autonomously.** Write `distilled.json`, then run `node <cli> atomize --apply distilled.json --write`. The toolkit creates new drafts under `_inbox/` and merges `update` notes in place. Print a compact summary (creates, updates with their targets, any skips) — this is information, not a checkpoint.

6. **Reassure + reversibility.** Tell the user what changed and that **every edited note was backed up** — any update is undoable with `cortex atomize --undo` (or via git). Updates skipped by the shrink guard are reported; re-run with `--force` only if the shrink is intended.
```

- [ ] **Step 2: Verify the skill structurally**

Run:
```bash
cd toolkit
grep -c -- '"action": "update"' skills/atomize/SKILL.md   # >= 1
grep -c -- '--undo' skills/atomize/SKILL.md                # >= 1
grep -c -- 'targetPath' skills/atomize/SKILL.md            # >= 1
head -4 skills/atomize/SKILL.md                            # frontmatter intact (name: atomize)
```
Expected: each grep ≥ 1; frontmatter present.

- [ ] **Step 3: Update README**

In `README.md`, in the `What it does today` capability table, change the **Atomize (AI)** row to mention updates, and add an **Undo** row:

```markdown
| **Atomize (AI)** | `atomize <src>` + the `/atomize` skill | an AI agent reads a source doc, splits it into one-idea-per-note drafts, infers type, routes a folder, adds tags + wikilinks, and **merges new info into existing notes** — autonomous, **dry-run by default** |
| **Undo** | `atomize --undo` | restores the most recent set of notes the agent edited (every in-place update is backed up first) |
```

And in the `The Cortex engine (toolkit)` section, after the existing `atomize --apply` CLI line, add:

```bash
node /path/to/toolkit/dist/cli.js atomize --apply distilled.json --write   # merges AI updates into existing notes (backed up first)
node /path/to/toolkit/dist/cli.js atomize --undo                           # roll back the last set of edited notes
```

Then bump the roadmap line to include `Phase 3.2 (autonomous update/merge) ✓`.

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, extend the `toolkit/` inventory row to note the update action and reversibility:

```markdown
| `toolkit/` | **The Cortex engine + agent** (Node/TS): reads any markdown vault into a note graph; CLI `init`/`status`/`orphans`/`viz`/`query`/`atomize`. `atomize` is **dry-run by default**; it creates `status: draft` notes in `_inbox/` and (Phase 3.2) **merges AI-distilled updates into existing notes in place** — each edited note is backed up to `.cortex/backups/` first and is reversible with `atomize --undo`; `Markdown/` sources are never modified. AI distillation runs through `toolkit/skills/atomize/` (the `/atomize` skill). Phases 0–3.2. |
```

- [ ] **Step 5: Commit**

```bash
git add toolkit/skills/atomize/SKILL.md README.md CLAUDE.md
git commit -m "feat(toolkit): /atomize update intent + document 3.2 (update + undo)"
```

---

## Self-Review

**Spec coverage (design §1–§9):**
- Reversibility (backups + `--undo`): Task 2 + Task 4. ✓
- Frontmatter-safe merge (`renderUpdatedNote`): Task 1. ✓
- Shrink guard + `--force`: Task 3 + Task 4. ✓
- Update validation (in-vault, exists, not a source): Task 3. ✓
- `DistilledNote.action/targetPath`, `DistilledApplyResult`: Task 1. ✓
- `update` apply path (backup → in-place write, dry-run safe): Task 3. ✓
- CLI `--force`/`--undo`, plan reporting of updates/skips: Task 4. ✓
- Skill update-intent + conservative merge + auto-apply UX: Task 5. ✓
- Create path unchanged (still `_inbox/`-confined): Task 3 (create branch untouched) + reused `applyAtomize`. ✓
- Docs (README + CLAUDE): Task 5. ✓
- Scope-out (route-in-place, auto-promotion, multi-source frontmatter, tag-union): not implemented — correct. ✓

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the skill prose is fully written.

**Type consistency:** `DistilledApplyResult` defined once (Task 1) and threaded through `applyDistilled` (Task 3) → `runApply`/`formatDistilledPlan` (Task 4). `renderUpdatedNote(existingContent, mergedBody, source)` (Task 1) consumed in Task 3. `backupNote(vaultDir, relPath, runId)` / `restoreLatestBackup(vaultDir)` (Task 2) consumed in Task 3/Task 4. `runUndo` (Task 4) wraps `restoreLatestBackup`. CLI imports match the new exports.

## Notes for execution

- **Safety is the review focus (Task 3).** Reviewers must confirm: dry-run writes nothing AND takes no backup; an `update` can never create a new file, never write under `Markdown/`, never resolve outside the vault; the shrink guard blocks unless `--force`; the existing note's frontmatter is byte-stable; and `--undo` restores exactly.
- **Reuse, don't duplicate:** the create path stays delegated to `applyAtomize` (its `_inbox/` confinement + dry-run guard are unchanged); only the new update branch adds writes, each preceded by a backup.
- **The agent provides the full merged body including the `# Heading`** for updates (renderUpdatedNote preserves only the frontmatter, not the old heading).
- **Phase 3.3 follow-ups (out of scope, log them):** route-in-place / auto-promotion out of `_inbox/`; multi-source frontmatter (list-valued `source`); tag-union on update; structured 3-way merge; `--undo` of a specific run (not just the latest).
