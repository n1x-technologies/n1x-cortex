# Cortex Atomize 3.1 (AI-distilled notes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two JSON seams to `cortex atomize` — `--emit-json` (emit the segmentation + vault context as data) and `--apply <specs.json>` (reconcile + render + write AI-distilled notes) — plus a `/atomize` Claude Code skill that distills each segment, so the toolkit stays the deterministic write-engine and Claude is the AI layer.

**Architecture:** The toolkit gains `emitPlan` (machine-readable plan) and `applyDistilled` (writes Claude's distilled notes through the *existing* Phase 3 safety machinery — reconcile, render, `_inbox/` confinement, dry-run). A new `toolkit/skills/atomize/SKILL.md` is the prose AI procedure. Claude only produces data; every file write goes through tested toolkit code.

**Tech Stack:** Node ≥ 20, TypeScript (ESM), vitest. No new dependencies (Phase 0/3 engine + Node stdlib). Builds on the shipped Phase 3 `src/atomize/` layer.

## Global Constraints

- **Builds on Phase 3** (`toolkit/`): reuse `loadConfig`, `scanVault`, `collectFrontmatterKeys`, `segmentSource`, `reconcile`, `slug`, `renderNote`, `applyAtomize`, and the existing types.
- **ESM** (`.js` import extensions), Node ≥ 20. Tool language English. Package root `toolkit/`.
- **WRITE SAFETY — unchanged, still enforced in tested toolkit code:**
  - **Dry-run by default.** `applyDistilled` writes to disk ONLY when `dryRun === false` (CLI `--write`).
  - **Draft barrier.** Every distilled note is written at `config.statusLifecycle[0]`.
  - **No duplicates.** `applyDistilled` runs each distilled note through `reconcile`; `skip` is reported, only `create` is written.
  - **Mandatory citation.** `renderNote` always emits the escaped `source` frontmatter field + the `*Source: [[…]]*` line.
  - **`_inbox/` confinement.** All writes go to `_inbox/<folder>/<id>.md` (folder optional); the existing `applyAtomize` prefix guard (`destPath.startsWith('_inbox/')`) holds for sub-paths.
  - **Never touches sources or existing notes.** Only new draft files are created (`create`); sources are read-only.
  - **Idempotent / de-collided.** Re-running yields `skip`; same-slug notes within one batch get `-2`, `-3` suffixes; empty slug → `note`.
- **Type/folder grounding:** `knownTypes`/`knownFolders` are discovered from the vault (curated notes only — exclude `Markdown/` and `_inbox/`).
- **Tests:** TDD for every module; the write path is tested against a temp vault and asserts dry-run writes nothing.

---

## File Structure

```
toolkit/
├── src/types.ts                    — add NoteSpec.tags?, AtomizeEmitPlan, EmitExistingNote, DistilledNote, DistilledInput (modify)
├── src/atomize/
│   ├── render.ts                   — renderNote: emit tags when present (modify)
│   ├── emit.ts                     — emitPlan(vaultDir, sourcePath, config) → AtomizeEmitPlan (new)
│   └── apply-distilled.ts          — applyDistilled(vaultDir, specsPath, config, {dryRun}) → { plan, written } (new)
├── src/commands/atomize.ts         — runEmit, runApply, formatDistilledPlan (modify)
├── src/cli.ts                      — atomize case: --emit-json / --apply <file> (modify)
├── skills/atomize/SKILL.md         — the /atomize AI-distillation procedure (new)
└── test/
    ├── render.test.ts              — add a tags-rendering test (modify)
    ├── emit.test.ts                — (new)
    ├── apply-distilled.test.ts     — (new)
    └── atomize.test.ts             — add emit/apply command tests (modify)
```

---

### Task 1: NoteSpec.tags + atomize-3.1 types + renderNote tags

**Files:**
- Modify: `toolkit/src/types.ts` (add `tags?` to `NoteSpec`; append 3.1 types)
- Modify: `toolkit/src/atomize/render.ts` (emit `tags`)
- Modify: `toolkit/test/render.test.ts` (add a tags test)

**Interfaces:**
- Consumes: `NoteSpec`, `CortexConfig`, `CortexFields`, `Segment` (types.js).
- Produces:
  `NoteSpec` now has optional `tags?: string[]`;
  `EmitExistingNote { id: string; title: string; path: string; type: string | null; folder: string }`;
  `AtomizeEmitPlan { source: string; sourcePath: string; lang: string | null; fields: CortexFields; statusFirst: string; knownTypes: string[]; knownFolders: string[]; existing: EmitExistingNote[]; segments: Segment[] }`;
  `DistilledNote { title: string; type?: string | null; folder?: string | null; tags?: string[]; body: string; fromHeading?: string }`;
  `DistilledInput { source: string; notes: DistilledNote[] }`;
  `renderNote(spec, config)` emits a `tags: [a, b]` line when `spec.tags` is non-empty.

- [ ] **Step 1: Append the 3.1 types and extend `NoteSpec` in `types.ts`**

In `toolkit/src/types.ts`, add `tags?: string[];` as the last field of the existing `NoteSpec` interface:

```ts
export interface NoteSpec {
  id: string;
  title: string;
  type: string | null;
  body: string;
  source: string;
  status: string;
  folder: string | null;
  tags?: string[];
}
```

Then append, after the existing `Segment` interface:

```ts
// ── Atomize 3.1 (AI-distilled) ─────────────────────────────────────
export interface EmitExistingNote {
  id: string;
  title: string;
  path: string;
  type: string | null;
  folder: string;
}
export interface AtomizeEmitPlan {
  source: string;
  sourcePath: string;
  lang: string | null;
  fields: CortexFields;
  statusFirst: string;
  knownTypes: string[];
  knownFolders: string[];
  existing: EmitExistingNote[];
  segments: Segment[];
}
export interface DistilledNote {
  title: string;
  type?: string | null;
  folder?: string | null;
  tags?: string[];
  body: string;
  fromHeading?: string;
}
export interface DistilledInput {
  source: string;
  notes: DistilledNote[];
}
```

- [ ] **Step 2: Write the failing test**

Add to `toolkit/test/render.test.ts`, inside the existing `describe('renderNote', ...)` block:

```ts
  it('emits a tags line when the spec carries tags, and omits it otherwise', () => {
    const cfg = loadConfig(mkdtempSync(join(tmpdir(), 'c-')), []);
    const withTags = renderNote({ ...spec, tags: ['rule', 'limit'] }, cfg);
    expect(withTags).toMatch(/tags: \[rule, limit\]/);
    const noTags = renderNote(spec, cfg);
    expect(noTags).not.toMatch(/tags:/);
  });
```

(`spec`, `loadConfig`, `mkdtempSync`, `join`, `tmpdir` are already imported at the top of `render.test.ts`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd toolkit && npm test -- render`
Expected: FAIL — the new test fails (`tags: [rule, limit]` not found) because `renderNote` does not emit tags yet.

- [ ] **Step 4: Extend `renderNote`**

In `toolkit/src/atomize/render.ts`, add the tags line right after the `type` line:

```ts
export function renderNote(spec: NoteSpec, config: CortexConfig): string {
  const f = config.fields;
  const fm: string[] = ['---'];
  fm.push(`${f.id}: ${spec.id}`);
  if (spec.type) fm.push(`${f.type}: ${spec.type}`);
  if (spec.tags && spec.tags.length) fm.push(`tags: [${spec.tags.join(', ')}]`);
  fm.push(`${f.status}: "${spec.status}"`);
  const safeSource = spec.source.replace(/"/g, '\\"');
  fm.push(`${f.source}: "[[${safeSource}]]"`);
  fm.push('---');
  return [
    fm.join('\n'),
    '',
    `# ${spec.title}`,
    '',
    spec.body.trim(),
    '',
    `*Source: [[${spec.source}]]*`,
    '',
  ].join('\n');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- render`
Expected: PASS (all render tests, including the new tags test).

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/types.ts toolkit/src/atomize/render.ts toolkit/test/render.test.ts
git commit -m "feat(toolkit): atomize 3.1 types + render note tags"
```

---

### Task 2: `emitPlan` — machine-readable plan + vault context

**Files:**
- Create: `toolkit/src/atomize/emit.ts`
- Test: `toolkit/test/emit.test.ts`

**Interfaces:**
- Consumes: `segmentSource` (segment.js), `scanVault` (vault.js), `CortexConfig`, `AtomizeEmitPlan`, `EmitExistingNote` (types.js).
- Produces: `emitPlan(vaultDir: string, sourcePath: string, config: CortexConfig): AtomizeEmitPlan` — segments from the source; `knownTypes`/`knownFolders` discovered from curated vault notes (excluding any note whose top-level `folder` is `_inbox`; `Markdown/` is already excluded by `scanVault`); `existing` = all scanned notes (incl. `_inbox` drafts, for dup-awareness); `statusFirst` = `config.statusLifecycle[0] ?? 'draft'`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/emit.test.ts
import { describe, it, expect } from 'vitest';
import { emitPlan } from '../src/atomize/emit.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-emit-'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '01-Concepts'));
  mkdirSync(join(dir, '03-Rules'));
  mkdirSync(join(dir, '_inbox'));
  writeFileSync(join(dir, '01-Concepts', 'a.md'), '---\ntype: concept\n---\n# Settlement');
  writeFileSync(join(dir, '03-Rules', 'b.md'), '---\ntype: rule\n---\n# Operation limit');
  writeFileSync(join(dir, '_inbox', 'old.md'), '---\ntype: draftish\n---\n# Old inbox note');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# Src\n\n## Topic A\n\nBody A.\n\n## Topic B\n\nBody B.');
  return dir;
}

describe('emitPlan', () => {
  it('emits segments, vault-discovered types/folders, statusFirst, and existing notes', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []); // default fields type/status/id/source; lifecycle ['draft','documented','verified']
    const plan = emitPlan(dir, join(dir, 'Markdown', 'src.md'), cfg);

    expect(plan.source).toBe('src');
    expect(plan.statusFirst).toBe('draft');
    expect(plan.segments.map(s => s.heading)).toEqual(['Src', 'Topic A', 'Topic B']);

    // discovered from curated notes only
    expect(plan.knownTypes.sort()).toEqual(['concept', 'rule']); // '_inbox' note's type excluded
    expect(plan.knownFolders.sort()).toEqual(['01-Concepts', '03-Rules']); // '_inbox' and 'Markdown' excluded

    // existing includes ALL scanned notes (incl. the _inbox draft) for dup-awareness
    expect(plan.existing.some(n => n.path === '_inbox/old.md')).toBe(true);
    expect(plan.existing.some(n => n.path.startsWith('Markdown/'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- emit`
Expected: FAIL — cannot find module `../src/atomize/emit.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/atomize/emit.ts
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { segmentSource } from './segment.js';
import { scanVault } from '../vault.js';
import type { AtomizeEmitPlan, EmitExistingNote, CortexConfig } from '../types.js';

const INBOX = '_inbox';

export function emitPlan(vaultDir: string, sourcePath: string, config: CortexConfig): AtomizeEmitPlan {
  const source = basename(sourcePath).replace(/\.md$/i, '');
  const text = readFileSync(sourcePath, 'utf8');
  const segments = segmentSource(text);

  const notes = scanVault(vaultDir, config); // already excludes Markdown/ (sourcesDir)
  const curated = notes.filter(n => n.folder !== INBOX);

  const knownTypes = [...new Set(
    curated.map(n => n.type).filter((t): t is string => !!t),
  )].sort();
  const knownFolders = [...new Set(
    curated.map(n => n.folder).filter((fld): fld is string => !!fld),
  )].sort();

  const existing: EmitExistingNote[] = notes.map(n => ({
    id: n.id, title: n.title, path: n.path, type: n.type, folder: n.folder,
  }));

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
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- emit`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/emit.ts toolkit/test/emit.test.ts
git commit -m "feat(toolkit): emit machine-readable atomize plan with vault context"
```

---

### Task 3: `applyDistilled` — write AI-distilled notes safely

**Files:**
- Create: `toolkit/src/atomize/apply-distilled.ts`
- Test: `toolkit/test/apply-distilled.test.ts`

**Interfaces:**
- Consumes: `slug` (propose.js), `reconcile` (reconcile.js), `scanVault` (vault.js), `applyAtomize` (plan.js), `DistilledInput`, `NoteSpec`, `AtomizePlan`, `AtomizePlanItem`, `CortexConfig` (types.js).
- Produces: `applyDistilled(vaultDir: string, specsPath: string, config: CortexConfig, opts?: { dryRun?: boolean }): { plan: AtomizePlan; written: string[] }` — reads a `DistilledInput` JSON file; builds a `NoteSpec` per note (`id = slug(title)`, `status = statusLifecycle[0]`, `source` from the input, `folder`/`tags` carried); reconciles against the vault; destPath = `_inbox/<folder>/<id>.md` (folder optional) with intra-batch de-collision; delegates writing to `applyAtomize` (dry-run + confinement + render reused). Dry-run by default.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/apply-distilled.test.ts
import { describe, it, expect } from 'vitest';
import { applyDistilled } from '../src/atomize/apply-distilled.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DistilledInput } from '../src/types.js';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-apply-'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '03-Rules'));
  // an existing curated note that one distilled note will duplicate (by title)
  writeFileSync(join(dir, '03-Rules', 'existing.md'), '---\ntype: rule\nid: existing\n---\n# Settlement window');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# ignored');
  return dir;
}

function specsFile(dir: string, input: DistilledInput): string {
  const p = join(dir, 'distilled.json');
  writeFileSync(p, JSON.stringify(input));
  return p;
}

const input: DistilledInput = {
  source: 'src',
  notes: [
    { title: 'Operation limit', type: 'rule', folder: '03-Rules', tags: ['rule', 'limit'], body: 'The limit is 5. See [[Settlement window]].' },
    { title: 'Operation limit', type: 'rule', folder: '03-Rules', body: 'A second note that slugs the same — must de-collide.' },
    { title: 'Settlement window', type: 'rule', folder: '03-Rules', body: 'Duplicate of an existing note — must skip.' },
  ],
};

describe('applyDistilled', () => {
  it('dry-runs by default and writes nothing', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const r = applyDistilled(dir, specsFile(dir, input), cfg, { dryRun: true });
    expect(r.written).toEqual([]);
    expect(r.plan.dryRun).toBe(true);
    expect(existsSync(join(dir, '_inbox'))).toBe(false);
  });

  it('writes distilled drafts under _inbox/<folder>/, de-collides, skips duplicates, renders tags + citation', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const r = applyDistilled(dir, specsFile(dir, input), cfg, { dryRun: false });

    // 2 creates (the third is a duplicate → skip)
    expect(r.written.length).toBe(2);
    expect(r.written.every(p => p.startsWith('_inbox/03-Rules/'))).toBe(true);
    expect(r.written).toContain('_inbox/03-Rules/operation-limit.md');
    expect(r.written).toContain('_inbox/03-Rules/operation-limit-2.md'); // de-collided
    expect(r.plan.items.some(i => i.action === 'skip')).toBe(true);      // 'Settlement window' duplicate

    // rendered content: tags + citation present, source file untouched
    const md = readFileSync(join(dir, '_inbox/03-Rules/operation-limit.md'), 'utf8');
    expect(md).toMatch(/tags: \[rule, limit\]/);
    expect(md).toMatch(/\*Source: \[\[src\]\]\*/);
    expect(readFileSync(join(dir, 'Markdown', 'src.md'), 'utf8')).toBe('# ignored');
  });

  it('routes a note with no folder to _inbox/ root', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const noFolder: DistilledInput = { source: 'src', notes: [{ title: 'Loose note', body: 'No folder.' }] };
    const r = applyDistilled(dir, specsFile(dir, noFolder), cfg, { dryRun: false });
    expect(r.written).toEqual(['_inbox/loose-note.md']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- apply-distilled`
Expected: FAIL — cannot find module `../src/atomize/apply-distilled.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/atomize/apply-distilled.ts
import { readFileSync } from 'node:fs';
import { slug } from './propose.js';
import { reconcile } from './reconcile.js';
import { scanVault } from '../vault.js';
import { applyAtomize } from './plan.js';
import type { AtomizePlan, AtomizePlanItem, DistilledInput, NoteSpec, CortexConfig } from '../types.js';

const INBOX = '_inbox';

export function applyDistilled(
  vaultDir: string,
  specsPath: string,
  config: CortexConfig,
  opts: { dryRun?: boolean } = {},
): { plan: AtomizePlan; written: string[] } {
  const dryRun = opts.dryRun ?? true;
  const input = JSON.parse(readFileSync(specsPath, 'utf8')) as DistilledInput;
  const existing = scanVault(vaultDir, config);
  const status = config.statusLifecycle[0] ?? 'draft';

  const usedPaths = new Set<string>();
  const items: AtomizePlanItem[] = input.notes.map(n => {
    const spec: NoteSpec = {
      id: slug(n.title),
      title: n.title,
      type: n.type ?? null,
      body: n.body,
      source: input.source,
      status,
      folder: n.folder ?? null,
      tags: n.tags,
    };
    const folderPrefix = spec.folder ? `${spec.folder}/` : '';
    const { action, matchPath } = reconcile(spec, existing);
    if (action !== 'create') {
      return { spec, action, matchPath, destPath: `${INBOX}/${folderPrefix}${spec.id}.md` };
    }
    // De-collide within the batch: empty slug → 'note'; duplicate path → -2, -3, …
    const baseId = spec.id.trim() === '' ? 'note' : spec.id;
    let finalId = baseId;
    let candidatePath = `${INBOX}/${folderPrefix}${finalId}.md`;
    let counter = 2;
    while (usedPaths.has(candidatePath)) {
      finalId = `${baseId}-${counter}`;
      candidatePath = `${INBOX}/${folderPrefix}${finalId}.md`;
      counter++;
    }
    usedPaths.add(candidatePath);
    return { spec: { ...spec, id: finalId }, action, matchPath, destPath: candidatePath };
  });

  const plan: AtomizePlan = { source: input.source, items, dryRun };
  const { written } = applyAtomize(vaultDir, plan); // reuses dry-run guard, _inbox confinement, render, mkdir
  return { plan, written };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- apply-distilled`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/apply-distilled.ts toolkit/test/apply-distilled.test.ts
git commit -m "feat(toolkit): apply AI-distilled notes through the safe write path"
```

---

### Task 4: `atomize` command modes + CLI wiring

**Files:**
- Modify: `toolkit/src/commands/atomize.ts` (add `runEmit`, `runApply`, `formatDistilledPlan`)
- Modify: `toolkit/src/cli.ts` (atomize case: `--emit-json` and `--apply <file>`)
- Modify: `toolkit/test/atomize.test.ts` (add emit/apply command tests)

**Interfaces:**
- Consumes: `loadConfig`, `collectFrontmatterKeys`, `emitPlan`, `applyDistilled`, `AtomizePlan` (toolkit modules).
- Produces:
  - `runEmit(vaultDir: string, sourcePath: string): string` — `JSON.stringify(emitPlan(...), null, 2)`.
  - `runApply(vaultDir: string, specsPath: string, opts: { write?: boolean }): { plan: AtomizePlan; written: string[] }`.
  - `formatDistilledPlan(r: { plan: AtomizePlan; written: string[] }): string` — human summary of the distilled apply.

- [ ] **Step 1: Write the failing test**

Add to `toolkit/test/atomize.test.ts` (the existing imports already include `mkdtempSync, mkdirSync, writeFileSync, existsSync` from `node:fs`, `tmpdir`, `join`):

```ts
import { runEmit, runApply, formatDistilledPlan } from '../src/commands/atomize.js';

describe('runEmit / runApply (atomize 3.1)', () => {
  it('runEmit prints valid JSON with segments and discovered context', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-emit-cmd-'));
    mkdirSync(join(dir, 'Markdown'));
    mkdirSync(join(dir, '03-Rules'));
    writeFileSync(join(dir, '03-Rules', 'r.md'), '---\ntype: rule\n---\n# Existing rule');
    writeFileSync(join(dir, 'Markdown', 'src.md'), '# Src\n\n## Topic A\n\nBody A.');
    const json = JSON.parse(runEmit(dir, join(dir, 'Markdown', 'src.md')));
    expect(json.source).toBe('src');
    expect(json.knownTypes).toContain('rule');
    expect(json.knownFolders).toContain('03-Rules');
    expect(json.segments.map((s: { heading: string }) => s.heading)).toContain('Topic A');
  });

  it('runApply dry-runs by default (writes nothing) and writes with --write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-apply-cmd-'));
    mkdirSync(join(dir, 'Markdown'));
    writeFileSync(join(dir, 'Markdown', 'src.md'), '# ignored');
    const specs = join(dir, 'd.json');
    writeFileSync(specs, JSON.stringify({ source: 'src', notes: [{ title: 'Operation limit', type: 'rule', folder: '03-Rules', body: 'B.' }] }));

    const dry = runApply(dir, specs, {});
    expect(dry.written).toEqual([]);
    expect(existsSync(join(dir, '_inbox'))).toBe(false);
    expect(formatDistilledPlan(dry)).toMatch(/dry-run|create/i);

    const wet = runApply(dir, specs, { write: true });
    expect(wet.written).toContain('_inbox/03-Rules/operation-limit.md');
    expect(existsSync(join(dir, '_inbox/03-Rules/operation-limit.md'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- atomize`
Expected: FAIL — `runEmit`/`runApply`/`formatDistilledPlan` are not exported from `../src/commands/atomize.js`.

- [ ] **Step 3: Add the command functions**

Append to `toolkit/src/commands/atomize.ts` (keep the existing `runAtomize`/`formatPlan`; add imports + the new exports):

```ts
// at the top, alongside the existing imports:
import { emitPlan } from '../atomize/emit.js';
import { applyDistilled } from '../atomize/apply-distilled.js';

// new exports (append after formatPlan):
export function runEmit(vaultDir: string, sourcePath: string): string {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return JSON.stringify(emitPlan(vaultDir, sourcePath, config), null, 2);
}

export function runApply(vaultDir: string, specsPath: string, opts: { write?: boolean }): { plan: AtomizePlan; written: string[] } {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return applyDistilled(vaultDir, specsPath, config, { dryRun: !opts.write });
}

export function formatDistilledPlan(r: { plan: AtomizePlan; written: string[] }): string {
  const lines: string[] = [];
  const creates = r.plan.items.filter(i => i.action === 'create').length;
  const skips = r.plan.items.filter(i => i.action === 'skip').length;
  lines.push(`Distilled: ${r.plan.source}  ·  ${r.plan.items.length} note(s)  ·  ${creates} create · ${skips} skip`);
  lines.push(r.plan.dryRun ? '(dry-run — nothing written; pass --write to apply)' : `wrote ${r.written.length} draft note(s)`);
  for (const i of r.plan.items) {
    const tag = i.action === 'skip' ? `skip (exists: ${i.matchPath})` : `create → ${i.destPath}`;
    lines.push(`  • ${i.spec.title}  [${i.spec.type ?? 'untyped'}]  [${tag}]`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Wire the CLI flags**

Replace the existing `atomize` case in `toolkit/src/cli.ts` with:

```ts
    case 'atomize': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const emit = rest.includes('--emit-json');
      const apply = rest.includes('--apply');
      const positional = rest.filter(a => !a.startsWith('--'));
      if (apply) {
        const specs = positional[0];
        if (!specs) { console.log('Usage: cortex atomize --apply <specs.json> [--write]'); return 1; }
        console.log(formatDistilledPlan(runApply(cwd, specs, { write })));
        return 0;
      }
      const source = positional[0];
      if (!source) { console.log('Usage: cortex atomize <source.md> [--emit-json | --write]'); return 1; }
      if (emit) { console.log(runEmit(cwd, source)); return 0; }
      console.log(formatPlan(runAtomize(cwd, source, { write })));
      return 0;
    }
```

Update the import line in `cli.ts` to pull the new functions:

```ts
import { runAtomize, formatPlan, runEmit, runApply, formatDistilledPlan } from './commands/atomize.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- atomize`
Expected: PASS (existing atomize tests + the 2 new ones).

- [ ] **Step 6: Full suite + build + temp-vault smoke**

Run: `cd toolkit && npm test` (all green), then `npm run build`.
Then a throwaway end-to-end smoke (do NOT touch the repo tree):

```bash
D=$(mktemp -d); mkdir -p "$D/Markdown" "$D/03-Rules"
printf -- '---\ntype: rule\n---\n# Existing rule\n' > "$D/03-Rules/r.md"
printf '# Src\n\n## Operation limit\n\nThe limit is 5.\n' > "$D/Markdown/src.md"
CLI="/Users/wagnersebastian/Documents/0. WSDC Tech/4. N1X/n1x-cortex/toolkit/dist/cli.js"
(cd "$D" && node "$CLI" atomize "Markdown/src.md" --emit-json | head -40)   # prints JSON: segments + knownTypes ['rule'] + knownFolders ['03-Rules']
printf '{"source":"src","notes":[{"title":"Operation limit","type":"rule","folder":"03-Rules","tags":["rule"],"body":"The limit is 5."}]}' > "$D/d.json"
(cd "$D" && node "$CLI" atomize --apply d.json)            # dry-run: prints plan, writes nothing
test ! -e "$D/_inbox" && echo "OK: dry-run wrote nothing"
(cd "$D" && node "$CLI" atomize --apply d.json --write)    # writes _inbox/03-Rules/operation-limit.md
test -f "$D/_inbox/03-Rules/operation-limit.md" && echo "OK: draft written under _inbox/03-Rules/"
```
Expected: emit prints JSON; `--apply` dry-run writes nothing; `--apply --write` creates `_inbox/03-Rules/operation-limit.md`; the source under `Markdown/` is untouched.

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/commands/atomize.ts toolkit/src/cli.ts toolkit/test/atomize.test.ts
git commit -m "feat(toolkit): atomize --emit-json and --apply <specs.json> modes"
```

---

### Task 5: the `/atomize` skill + docs

**Files:**
- Create: `toolkit/skills/atomize/SKILL.md`
- Modify: `README.md` (document `--emit-json`/`--apply` + the `/atomize` skill)
- Modify: `CLAUDE.md` (toolkit inventory line: note the 3.1 distillation flow)

**Interfaces:**
- Consumes (at runtime): the `cortex atomize <src> --emit-json` and `cortex atomize --apply <specs.json> [--write]` CLI modes from Task 4.
- Produces: a prose Claude Code skill (no exported code). This task ships the AI layer + docs; it has no unit test — verification is a structural check on the `SKILL.md` plus a manual smoke.

- [ ] **Step 1: Write the `/atomize` skill**

Create `toolkit/skills/atomize/SKILL.md`:

```markdown
---
name: atomize
description: Use when the user wants to atomize a source document into draft Cortex notes — "atomize this doc", "turn this into atomic notes", or /atomize <source.md>. Distills each section into one-idea-per-note drafts (type, folder, tags, wikilinks) and writes them safely into _inbox/ via the cortex toolkit.
---

# Atomize a source into AI-distilled draft notes

You are the **AI layer** of the N1X Cortex atomize pipeline. The `cortex` toolkit is the deterministic engine; you do the distillation. Every file write goes through the toolkit — you only produce data.

## Procedure

1. **Resolve the source.** Confirm the source markdown path (under the vault's `Markdown/`). Build the CLI path to `toolkit/dist/cli.js` (run `npm run build` in `toolkit/` first if `dist/` is missing).

2. **Emit the plan.** Run `node <cli> atomize "<source.md>" --emit-json` from the vault dir. Parse the JSON: `segments`, `knownTypes`, `knownFolders`, `existing`, `statusFirst`, `lang`, `fields`.

3. **Distill each segment** into one or more atomic notes, following the methodology:
   - **Atomic — one idea per note.** If a segment covers two things that could change independently, split it into multiple notes (Pillar 1).
   - **Type:** choose from `knownTypes`. Only introduce a new type when none fits — and call it out in the preview.
   - **Folder:** route from `knownFolders` (match the vault's type→folder convention).
   - **Cold-vault fallback:** if `knownTypes`/`knownFolders` are empty, use the methodology's canonical vocabulary (types `concept/flow/rule/technical/error/security/ux/mvp/strategy`; folders `01-Concepts/ … 09-Strategy/`), localized to `lang` when set, and note in the preview that a new taxonomy is being seeded.
   - **Body:** rewrite into clean, structured natural language — not a copy of the source. For flow/process notes, add an *Implications for implementation* section.
   - **Connect:** add `[[wikilinks]]` to related sibling notes and to notes in `existing`. Dangling links are valid (Pillar 2).
   - **Tags + language:** add `tags`; write in the vault's `lang`.
   - **No duplicates:** if a strong match already exists in `existing`, drop that note (the toolkit will also skip it).

4. **Write the distilled specs** to a temp file `distilled.json`:
   `{ "source": "<emit.source>", "notes": [ { "title", "type", "folder", "tags": [...], "body", "fromHeading" }, ... ] }`.

5. **Dry-run and preview.** Run `node <cli> atomize --apply distilled.json` (no `--write`). Show the user the plan summary: note count, each title `[type → folder]`, splits, any skips or newly-seeded types. **Stop and ask: apply these to _inbox/?**

6. **Apply on approval.** On "go," run `node <cli> atomize --apply distilled.json --write`. Report what landed under `_inbox/<folder>/`. The notes are `status: draft` in the `_inbox/` staging area — the user reviews and promotes them into the curated folders.

## Safety (enforced by the toolkit, but respect them)

- Dry-run is the default; only `--write` writes. Always preview before writing.
- Notes land only in `_inbox/<folder>/` as `status: draft`. Never write into curated folders directly.
- Never modify the source file or existing notes.
- Citations are mandatory (the toolkit adds them); keep the `source` correct.
```

- [ ] **Step 2: Verify the skill structurally**

Run:
```bash
cd toolkit
head -4 skills/atomize/SKILL.md   # confirm YAML frontmatter with name: atomize + a description
grep -c -- '--emit-json' skills/atomize/SKILL.md   # >= 1
grep -c -- '--apply' skills/atomize/SKILL.md       # >= 1
grep -c -- '--write' skills/atomize/SKILL.md        # >= 1
```
Expected: frontmatter present with `name: atomize`; each grep ≥ 1 (the skill references the real CLI modes built in Task 4).

- [ ] **Step 3: Manual smoke (throwaway vault, no repo writes)**

This is the human-in-the-loop check that the skill's procedure maps onto the real CLI. Reuse the Task 4 smoke vault flow: `--emit-json` produces parseable context, hand-author a 2-note `distilled.json` (including one split and one `[[wikilink]]`), `--apply` dry-run writes nothing, `--apply --write` creates the drafts under `_inbox/<folder>/`. Confirm the source stays untouched. (No assertion harness — eyeball the output.)

- [ ] **Step 4: Update README**

In `README.md`, in the Cortex Toolkit section, extend the atomize lines and add a note about the `/atomize` skill. After the existing `atomize` CLI lines, add:

```bash
node /path/to/toolkit/dist/cli.js atomize src.md --emit-json        # emit segmentation + vault context as JSON (for the AI layer)
node /path/to/toolkit/dist/cli.js atomize --apply distilled.json    # write AI-distilled notes (DRY-RUN; --write applies)
```

And add a bullet after the write-safety bullet:

```markdown
- **AI-distilled atomization (`/atomize` skill):** `toolkit/skills/atomize/` is the Claude Code skill that turns a source doc into distilled atomic drafts — Claude rewrites each section, infers `type`, splits non-atomic sections, routes a folder, and adds tags + wikilinks, then writes them via `--apply` into `_inbox/`. The toolkit stays the deterministic, dependency-free engine; the intelligence lives in the skill.
```

Also bump the roadmap line: `Phase 3 (assisted atomization) ✓ · Phase 3.1 (AI-distilled notes) ✓`.

- [ ] **Step 5: Update CLAUDE.md**

In `CLAUDE.md`, extend the `toolkit/` inventory row to mention the 3.1 distillation flow:

```markdown
| `toolkit/` | **The Cortex engine + viewer + query + atomize** (Node/TS): reads any markdown vault into a note graph; CLI `init`/`status`/`orphans`/`viz`/`query`/`atomize`. `atomize` is **dry-run by default** and writes `status: draft` notes only into `_inbox/` (never edits existing notes or sources). Phase 3.1 adds AI distillation: `atomize --emit-json` (plan as data) + `atomize --apply <specs.json>` (write distilled notes), driven by the `toolkit/skills/atomize/` `/atomize` skill (the AI layer). Phases 0–3.1. |
```

- [ ] **Step 6: Commit**

```bash
git add toolkit/skills/atomize/SKILL.md README.md CLAUDE.md
git commit -m "feat(toolkit): add /atomize distillation skill + document 3.1"
```

---

## Self-Review

**Spec coverage (design §1–§9):**
- Architecture (two JSON seams, toolkit writes, skill is AI layer): Tasks 2–5. ✓
- `--emit-json` with vault-discovered `knownTypes`/`knownFolders` (excl. `Markdown/`+`_inbox/`), `existing`, `statusFirst`, segments: Task 2. ✓
- `--apply` reconcile + render + `_inbox/<folder>/` + dry-run + de-collision + skip: Task 3. ✓
- `NoteSpec.tags` + `renderNote` tags: Task 1. ✓
- Command modes + CLI flags + smoke: Task 4. ✓
- `/atomize` skill with distillation rules (atomic/split/type/folder/cold-vault fallback/body/connect/tags/language) + batch-checkpoint UX + staging: Task 5. ✓
- Write-safety guarantees (dry-run, draft, no-dup, citation, confinement, sources untouched): reused from Phase 3 via `applyAtomize`, asserted in Tasks 3–4. ✓
- Docs (README + CLAUDE): Task 5. ✓
- Scope-out items (update/merge, route-in-place, auto-promotion, folder frontmatter field): not implemented — correct. ✓

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the skill body is fully written.

**Type consistency:** `AtomizeEmitPlan`/`EmitExistingNote`/`DistilledNote`/`DistilledInput`/`NoteSpec.tags?` defined once in Task 1; `emitPlan` (Task 2) → `runEmit` (Task 4); `applyDistilled` (Task 3) → `runApply` (Task 4) form a consistent chain. `applyDistilled` reuses `applyAtomize`/`reconcile`/`slug`/`renderNote` with their existing signatures. CLI imports match the new exports.

## Notes for execution

- **Reuse over reinvention.** `applyDistilled` deliberately delegates the actual writing to the existing, tested `applyAtomize` — do NOT duplicate the write/confinement/dry-run logic; only the spec-building + folder-aware de-collision is new.
- **The `_inbox/` confinement guard already allows sub-paths** (`destPath.startsWith('_inbox/')` is true for `_inbox/03-Rules/x.md`), so no change to `applyAtomize` is needed.
- **The skill is prose, not code** — its "tests" are the structural grep + a manual smoke. Its real validation is using it on a real doc later.
- **Phase 3.2 follow-ups (out of scope, log them):** `update` action (merge a distilled note into an existing one); route-in-place config (`atomize.routeInPlace`) to write straight into curated folders; auto-promotion out of `_inbox/`; a `folder:` frontmatter hint field; per-vault distillation style config.
```
