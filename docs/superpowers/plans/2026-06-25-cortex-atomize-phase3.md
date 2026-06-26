# Cortex Atomize (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cortex atomize <source.md>` — the **mechanical write-side machinery** that turns a source document into draft atomic notes, safely: segment → propose → reconcile (no duplicates) → write as `status: draft` with a mandatory citation. **Dry-run by default**; `--write` applies. The model-driven "smart distillation" of each segment is an explicit follow-on (the engine here does deterministic structural atomization and provides the seams an AI fills).

**Architecture:** A new `src/atomize/` layer on Phase 0. `segment` splits a source markdown by headings into units; `propose` turns each unit into a structured note spec (title, type, body, source citation, status=first lifecycle stage); `reconcile` fuzzy-matches each proposal against existing notes (create / update / skip — never blindly duplicate); `render` serializes a spec to `.md` (frontmatter + body + citation); `planAtomize` assembles a dry-run plan and `applyAtomize` writes it. The `atomize` CLI command prints the plan (diff) and only writes with `--write`.

**Tech Stack:** Node ≥ 20, TypeScript (ESM), vitest. No new dependencies (the Phase 0 engine + Node stdlib).

## Global Constraints

- **Builds on Phase 0** (`toolkit/`): reuse `loadConfig`, `collectFrontmatterKeys`, `scanVault`, `buildNote`, `parseFrontmatter`, types.
- **ESM** (`.js` import extensions), Node ≥ 20. Tool language English. Package root `toolkit/`.
- **WRITE SAFETY — the headline of this phase:**
  - **Dry-run by default.** `applyAtomize`/the CLI write to disk ONLY when `dryRun === false` (CLI `--write`). The default run computes the plan and a diff and writes nothing.
  - **Draft barrier.** Every generated note is written at the first non-immutable lifecycle stage (`config.statusLifecycle[0]`, e.g. `borrador`/`draft`). Nothing is auto-`verified`.
  - **No duplicates.** `reconcile` matches a proposal against existing notes (by id, then fuzzy title) and returns `skip` (or `update`) instead of creating a second note.
  - **Mandatory citation.** A proposed note always carries a `source` (the originating source path/name); `render` emits the citation line. A proposal with no resolvable source is still written but flagged in the plan.
  - **Never touches sources or existing notes' bodies in v1.** v1 only CREATES new draft notes (action `create`); `update`/`skip` are reported but `applyAtomize` performs only creates (updates are a follow-on). It never edits `Markdown/` sources.
  - **Scoped & idempotent.** Re-running `atomize` on the same source yields `skip` for already-created notes (reconcile), so it does not duplicate.
- **Tests:** TDD for every module; the write path is tested against a temp vault and asserts dry-run writes nothing.

---

## File Structure

```
toolkit/
├── src/types.ts              — add NoteSpec, AtomizeAction, AtomizePlanItem, AtomizePlan (modify)
├── src/atomize/
│   ├── segment.ts            — segmentSource(text) → Segment[]
│   ├── propose.ts            — proposeNotes(segments, sourceName, config) → NoteSpec[]
│   ├── reconcile.ts          — reconcile(spec, existing) → { action, matchPath? }
│   ├── render.ts             — renderNote(spec, config) → string (.md)
│   └── plan.ts               — planAtomize(...) / applyAtomize(...)
├── src/commands/atomize.ts   — runAtomize(vaultDir, source, { write }), formatPlan(plan)
├── src/cli.ts                — add `atomize` case (modify)
└── test/
    ├── segment.test.ts
    ├── propose.test.ts
    ├── reconcile.test.ts
    ├── render.test.ts
    └── atomize.test.ts
```

---

### Task 1: Atomize types + source segmentation

**Files:**
- Modify: `toolkit/src/types.ts` (append atomize types)
- Create: `toolkit/src/atomize/segment.ts`
- Test: `toolkit/test/segment.test.ts`

**Interfaces:**
- Produces:
  `NoteSpec { id: string; title: string; type: string | null; body: string; source: string; status: string; folder: string | null }`;
  `AtomizeAction = 'create' | 'update' | 'skip'`;
  `AtomizePlanItem { spec: NoteSpec; action: AtomizeAction; matchPath: string | null; destPath: string }`;
  `AtomizePlan { source: string; items: AtomizePlanItem[]; dryRun: boolean }`;
  `Segment { heading: string; level: number; body: string }`;
  `segmentSource(text: string): Segment[]`.

- [ ] **Step 1: Append the atomize types to `types.ts`**

```ts
// ── Atomize (Phase 3) ──────────────────────────────────────────────
export interface NoteSpec {
  id: string;
  title: string;
  type: string | null;
  body: string;
  source: string;
  status: string;
  folder: string | null;
}
export type AtomizeAction = 'create' | 'update' | 'skip';
export interface AtomizePlanItem {
  spec: NoteSpec;
  action: AtomizeAction;
  matchPath: string | null;
  destPath: string;
}
export interface AtomizePlan {
  source: string;
  items: AtomizePlanItem[];
  dryRun: boolean;
}
export interface Segment {
  heading: string;
  level: number;
  body: string;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// toolkit/test/segment.test.ts
import { describe, it, expect } from 'vitest';
import { segmentSource } from '../src/atomize/segment.js';

describe('segmentSource', () => {
  it('splits a markdown source into one segment per heading with its body', () => {
    const src = '# Title\n\nIntro under title.\n\n## Rule A\n\nBody of A.\nMore A.\n\n## Rule B\n\nBody of B.';
    const segs = segmentSource(src);
    expect(segs.map(s => s.heading)).toEqual(['Title', 'Rule A', 'Rule B']);
    expect(segs.find(s => s.heading === 'Rule A')?.body.trim()).toBe('Body of A.\nMore A.');
    expect(segs.find(s => s.heading === 'Rule A')?.level).toBe(2);
  });
  it('ignores frontmatter and returns [] when there are no headings', () => {
    expect(segmentSource('---\nx: 1\n---\njust text, no headings')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd toolkit && npm test -- segment`
Expected: FAIL — cannot find module `../src/atomize/segment.js`.

- [ ] **Step 4: Write the implementation**

```ts
// toolkit/src/atomize/segment.ts
import type { Segment } from '../types.js';

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

export function segmentSource(text: string): Segment[] {
  // strip YAML frontmatter
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = body.split('\n');
  const segments: Segment[] = [];
  let current: Segment | null = null;
  for (const line of lines) {
    const m = line.match(HEADING);
    if (m) {
      if (current) segments.push(current);
      current = { heading: m[2].trim(), level: m[1].length, body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) segments.push(current);
  return segments.map(s => ({ ...s, body: s.body.replace(/\n+$/, '') }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- segment`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/types.ts toolkit/src/atomize/segment.ts toolkit/test/segment.test.ts
git commit -m "feat(toolkit): atomize types and source segmentation"
```

---

### Task 2: Propose note specs

**Files:**
- Create: `toolkit/src/atomize/propose.ts`
- Test: `toolkit/test/propose.test.ts`

**Interfaces:**
- Consumes: `Segment`, `NoteSpec`, `CortexConfig` (types.js).
- Produces: `proposeNotes(segments: Segment[], sourceName: string, config: CortexConfig): NoteSpec[]` — one NoteSpec per segment: `id` = slug(heading), `title` = heading, `type` = null (set by the AI/curation later), `body` = the segment body, `source` = sourceName, `status` = `config.statusLifecycle[0]`, `folder` = null. Also `export function slug(s: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/propose.test.ts
import { describe, it, expect } from 'vitest';
import { proposeNotes, slug } from '../src/atomize/propose.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const cfg = loadConfig(mkdtempSync(`${tmpdir()}/cortex-p-`), ['tipo', 'estado']); // statusLifecycle default ['draft','documented','verified']

describe('slug', () => {
  it('kebab-cases and strips accents/punctuation', () => {
    expect(slug('Límite de Operación X!')).toBe('limite-de-operacion-x');
  });
});

describe('proposeNotes', () => {
  it('maps each segment to a draft NoteSpec citing the source', () => {
    const specs = proposeNotes(
      [{ heading: 'Operation limit', level: 2, body: 'The limit is 5.' }],
      'FUENTE-rules', cfg,
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].title).toBe('Operation limit');
    expect(specs[0].id).toBe('operation-limit');
    expect(specs[0].body).toBe('The limit is 5.');
    expect(specs[0].source).toBe('FUENTE-rules');
    expect(specs[0].status).toBe('draft');     // first lifecycle stage
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- propose`
Expected: FAIL — cannot find module `../src/atomize/propose.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/atomize/propose.ts
import type { Segment, NoteSpec, CortexConfig } from '../types.js';

export function slug(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function proposeNotes(segments: Segment[], sourceName: string, config: CortexConfig): NoteSpec[] {
  const status = config.statusLifecycle[0] ?? 'draft';
  return segments.map(seg => ({
    id: slug(seg.heading),
    title: seg.heading,
    type: null,
    body: seg.body,
    source: sourceName,
    status,
    folder: null,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- propose`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/propose.ts toolkit/test/propose.test.ts
git commit -m "feat(toolkit): propose draft note specs from segments"
```

---

### Task 3: Reconcile against existing notes

**Files:**
- Create: `toolkit/src/atomize/reconcile.ts`
- Test: `toolkit/test/reconcile.test.ts`

**Interfaces:**
- Consumes: `NoteSpec`, `Note` (types.js).
- Produces: `reconcile(spec: NoteSpec, existing: Note[]): { action: 'create' | 'skip'; matchPath: string | null }` — `skip` (with the matched note's path) when an existing note has the same `id` or a normalized-title match; otherwise `create`. (v1 reports only create/skip; `update` is a documented follow-on.)

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/reconcile.test.ts
import { describe, it, expect } from 'vitest';
import { reconcile } from '../src/atomize/reconcile.js';
import type { Note, NoteSpec } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}
const spec: NoteSpec = { id: 'operation-limit', title: 'Operation limit', type: null,
  body: '', source: 'S', status: 'draft', folder: null };

describe('reconcile', () => {
  it('skips when an existing note shares the id', () => {
    const r = reconcile(spec, [note({ id: 'operation-limit', path: '03-Rules/x.md' })]);
    expect(r).toEqual({ action: 'skip', matchPath: '03-Rules/x.md' });
  });
  it('skips when an existing note has a matching normalized title', () => {
    const r = reconcile(spec, [note({ id: 'other', title: 'Operation Limit', path: '03-Rules/y.md' })]);
    expect(r).toEqual({ action: 'skip', matchPath: '03-Rules/y.md' });
  });
  it('creates when nothing matches', () => {
    const r = reconcile(spec, [note({ id: 'unrelated', title: 'Colors' })]);
    expect(r).toEqual({ action: 'create', matchPath: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- reconcile`
Expected: FAIL — cannot find module `../src/atomize/reconcile.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/atomize/reconcile.ts
import type { Note, NoteSpec } from '../types.js';

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function reconcile(spec: NoteSpec, existing: Note[]): { action: 'create' | 'skip'; matchPath: string | null } {
  const titleN = norm(spec.title);
  for (const n of existing) {
    if (n.id === spec.id || norm(n.title) === titleN) {
      return { action: 'skip', matchPath: n.path };
    }
  }
  return { action: 'create', matchPath: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- reconcile`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/reconcile.ts toolkit/test/reconcile.test.ts
git commit -m "feat(toolkit): reconcile proposals against existing notes (no duplicates)"
```

---

### Task 4: Render a note + plan/apply

**Files:**
- Create: `toolkit/src/atomize/render.ts`
- Create: `toolkit/src/atomize/plan.ts`
- Test: `toolkit/test/render.test.ts`

**Interfaces:**
- Consumes: `NoteSpec`, `AtomizePlan`, `AtomizePlanItem`, `CortexConfig`, `Note`; `proposeNotes`, `segmentSource`, `reconcile`; `loadConfig`, `scanVault`, `collectFrontmatterKeys`.
- Produces:
  - `renderNote(spec: NoteSpec, config: CortexConfig): string` — the `.md`: YAML frontmatter (`config.fields.type`/`status`/`id`/`source` mapped from the spec) + `# Title` + body + a `*Source: [[…]]*` citation line.
  - `planAtomize(vaultDir: string, sourcePath: string, config: CortexConfig, opts?: { dryRun?: boolean }): AtomizePlan`.
  - `applyAtomize(vaultDir: string, plan: AtomizePlan): { written: string[] }` — writes ONLY `create` items, ONLY when `plan.dryRun === false`; returns the paths written (empty on dry-run).

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/render.test.ts
import { describe, it, expect } from 'vitest';
import { renderNote, planAtomize, applyAtomize } from '../src/atomize/plan.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NoteSpec } from '../src/types.js';

const spec: NoteSpec = { id: 'op-limit', title: 'Operation limit', type: null,
  body: 'The limit is 5.', source: 'FUENTE-rules', status: 'draft', folder: null };

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-atom-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'rules.md'), '# Rules\n\n## Operation limit\n\nThe limit is 5.\n\n## Other rule\n\nText.');
  return dir;
}

describe('renderNote', () => {
  it('emits frontmatter, title, body and a source citation', () => {
    const cfg = loadConfig(mkdtempSync(join(tmpdir(), 'c-')), ['tipo', 'estado']);
    const md = renderNote(spec, cfg);
    expect(md).toMatch(/^---/);
    expect(md).toMatch(/id: op-limit/);
    expect(md).toMatch(/status: draft/);
    expect(md).toMatch(/# Operation limit/);
    expect(md).toMatch(/The limit is 5\./);
    expect(md).toMatch(/\[\[FUENTE-rules\]\]/);
  });
});

describe('planAtomize / applyAtomize', () => {
  it('plans creates as a dry-run and writes nothing', () => {
    const dir = vault();
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    const plan = planAtomize(dir, join(dir, 'Markdown', 'rules.md'), cfg, { dryRun: true });
    expect(plan.dryRun).toBe(true);
    expect(plan.items.map(i => i.action)).toEqual(['create', 'create', 'create']);
    const res = applyAtomize(dir, plan);
    expect(res.written).toEqual([]);                           // dry-run writes nothing
  });
  it('writes draft notes only when dryRun is false, and is idempotent', () => {
    const dir = vault();
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    const plan = planAtomize(dir, join(dir, 'Markdown', 'rules.md'), cfg, { dryRun: false });
    const res = applyAtomize(dir, plan);
    expect(res.written.length).toBe(3);
    expect(existsSync(join(dir, res.written[0]))).toBe(true);
    // re-plan: existing notes now reconcile to skip
    const notes2 = readdirSync(dir);
    const plan2 = planAtomize(dir, join(dir, 'Markdown', 'rules.md'), cfg, { dryRun: false });
    expect(plan2.items.every(i => i.action === 'skip')).toBe(true);
    expect(notes2.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- render`
Expected: FAIL — cannot find module `../src/atomize/plan.js`.

- [ ] **Step 3: Write `render.ts`**

```ts
// toolkit/src/atomize/render.ts
import type { NoteSpec, CortexConfig } from '../types.js';

export function renderNote(spec: NoteSpec, config: CortexConfig): string {
  const f = config.fields;
  const fm: string[] = ['---'];
  fm.push(`${f.id}: ${spec.id}`);
  if (spec.type) fm.push(`${f.type}: ${spec.type}`);
  fm.push(`${f.status}: ${spec.status}`);
  fm.push(`${f.source}: "[[${spec.source}]]"`);
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

- [ ] **Step 4: Write `plan.ts`**

```ts
// toolkit/src/atomize/plan.ts
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { segmentSource } from './segment.js';
import { proposeNotes } from './propose.js';
import { reconcile } from './reconcile.js';
import { renderNote } from './render.js';
import type { AtomizePlan, AtomizePlanItem, CortexConfig } from '../types.js';

export { renderNote };

// Where new draft notes land: a `_inbox/` folder under the vault root (review then move).
const INBOX = '_inbox';

export function planAtomize(vaultDir: string, sourcePath: string, config: CortexConfig, opts: { dryRun?: boolean } = {}): AtomizePlan {
  const dryRun = opts.dryRun ?? true;
  const sourceName = basename(sourcePath).replace(/\.md$/i, '');
  const text = readFileSync(sourcePath, 'utf8');
  const segments = segmentSource(text);
  const specs = proposeNotes(segments, sourceName, config);
  const existing = scanVault(vaultDir, config);

  const items: AtomizePlanItem[] = specs.map(spec => {
    const { action, matchPath } = reconcile(spec, existing);
    const destPath = `${INBOX}/${spec.id}.md`;
    return { spec, action, matchPath, destPath };
  });
  return { source: sourceName, items, dryRun };
}

export function applyAtomize(vaultDir: string, plan: AtomizePlan): { written: string[] } {
  if (plan.dryRun) return { written: [] };
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const written: string[] = [];
  for (const item of plan.items) {
    if (item.action !== 'create') continue;
    const abs = join(vaultDir, item.destPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, renderNote(item.spec, config));
    written.push(item.destPath);
  }
  return { written };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- render`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/atomize/render.ts toolkit/src/atomize/plan.ts toolkit/test/render.test.ts
git commit -m "feat(toolkit): render draft notes and plan/apply atomization (dry-run default)"
```

---

### Task 5: `atomize` command + CLI wiring

**Files:**
- Create: `toolkit/src/commands/atomize.ts`
- Modify: `toolkit/src/cli.ts` (add `atomize` case + import; update usage string)
- Test: `toolkit/test/atomize.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `collectFrontmatterKeys`, `planAtomize`, `applyAtomize`.
- Produces:
  - `runAtomize(vaultDir: string, sourcePath: string, opts: { write?: boolean }): { plan: AtomizePlan; written: string[] }`.
  - `formatPlan(r: { plan: AtomizePlan; written: string[] }): string`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/atomize.test.ts
import { describe, it, expect } from 'vitest';
import { runAtomize, formatPlan } from '../src/commands/atomize.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-acmd-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'rules.md'), '# Rules\n\n## Operation limit\n\nThe limit is 5.');
  return dir;
}

describe('runAtomize', () => {
  it('dry-runs by default (writes nothing) and reports the plan', () => {
    const dir = vault();
    const r = runAtomize(dir, join(dir, 'Markdown', 'rules.md'), {});
    expect(r.plan.dryRun).toBe(true);
    expect(r.written).toEqual([]);
    expect(existsSync(join(dir, '_inbox', 'operation-limit.md'))).toBe(false);
    expect(formatPlan(r)).toMatch(/dry-run|create/i);
  });
  it('writes draft notes with --write', () => {
    const dir = vault();
    const r = runAtomize(dir, join(dir, 'Markdown', 'rules.md'), { write: true });
    expect(r.written.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, '_inbox', 'operation-limit.md'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- atomize`
Expected: FAIL — cannot find module `../src/commands/atomize.js`.

- [ ] **Step 3: Write the `atomize` command**

```ts
// toolkit/src/commands/atomize.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { planAtomize, applyAtomize } from '../atomize/plan.js';
import type { AtomizePlan } from '../types.js';

export function runAtomize(vaultDir: string, sourcePath: string, opts: { write?: boolean }): { plan: AtomizePlan; written: string[] } {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const plan = planAtomize(vaultDir, sourcePath, config, { dryRun: !opts.write });
  const { written } = applyAtomize(vaultDir, plan);
  return { plan, written };
}

export function formatPlan(r: { plan: AtomizePlan; written: string[] }): string {
  const lines: string[] = [];
  const creates = r.plan.items.filter(i => i.action === 'create').length;
  const skips = r.plan.items.filter(i => i.action === 'skip').length;
  lines.push(`Source: ${r.plan.source}  ·  ${r.plan.items.length} segments  ·  ${creates} create · ${skips} skip`);
  lines.push(r.plan.dryRun ? '(dry-run — nothing written; pass --write to apply)' : `wrote ${r.written.length} draft note(s)`);
  for (const i of r.plan.items) {
    const tag = i.action === 'skip' ? `skip (exists: ${i.matchPath})` : `create → ${i.destPath}`;
    lines.push(`  • ${i.spec.title}  [${tag}]`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Wire it into the CLI**

```ts
// in toolkit/src/cli.ts — add import at top:
import { runAtomize, formatPlan } from './commands/atomize.js';

// add this case inside the switch (before `default`):
    case 'atomize': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const source = rest.find(a => !a.startsWith('--'));
      if (!source) { console.log('Usage: cortex atomize <source.md> [--write]'); return 1; }
      console.log(formatPlan(runAtomize(cwd, source, { write })));
      return 0;
    }
```

Also update the usage string in the `default` case to include `atomize`:
```ts
      console.log('Usage: cortex <init|status|orphans|viz|query|atomize>');
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- atomize`
Expected: PASS (2 tests).

- [ ] **Step 6: Full suite + real-vault dry-run smoke**

Run: `cd toolkit && npm test` (all green), then `npm run build`.
From a real vault dir: `node "<repo>/toolkit/dist/cli.js" atomize "Markdown/<some-source>.md"` (NO `--write`)
Expected: prints the plan (segments → create/skip) and writes nothing. (Only add `--write` against a throwaway copy.)

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/commands/atomize.ts toolkit/src/cli.ts toolkit/test/atomize.test.ts
git commit -m "feat(toolkit): add cortex atomize command (dry-run default, --write applies)"
```

---

## Self-Review

**Spec coverage (design §6 atomization):**
- Segment (mechanical): Task 1. ✓
- Extract → note spec: Task 2 (`proposeNotes`) — deterministic structural version; AI-distilled extraction is the documented follow-on. ✓ (partial of §6 step 3; the model seam)
- Reconcile (no duplicates): Task 3. ✓ (§6 step 4)
- Write (draft barrier, citation, dry-run): Task 4 (`render`/`plan`/`apply`). ✓ (§6 steps 6; guards)
- Command (assisted, dry-run default + `--write`): Task 5. ✓ (the assisted `/atomize` mode)
- Write-safety guards (dry-run default, draft status, no-dup, citation, never edits sources): enforced in Tasks 3–5 and asserted (dry-run writes nothing; idempotent re-run skips). ✓

**Placeholder scan:** no TBD; every step has complete code.

**Type consistency:** `NoteSpec`/`AtomizeAction`/`AtomizePlanItem`/`AtomizePlan`/`Segment` defined once in `types.ts` (Task 1); `segmentSource`→`proposeNotes`→`reconcile`→`renderNote`→`planAtomize`/`applyAtomize`→`runAtomize`/`formatPlan` form a consistent chain with matching signatures across producing/consuming tasks.

## Notes for execution

- **Write safety is the review focus.** Every reviewer must confirm: dry-run is the default everywhere, `applyAtomize` writes nothing when `dryRun`, generated notes carry `status = statusLifecycle[0]`, reconcile prevents duplicates, the source file is never modified, and writes are confined to `_inbox/` under the vault root.
- New draft notes land in `_inbox/` (a review staging folder) so they never silently mix into the curated numbered folders until a human moves them.
- Phase-3.1 follow-ups (out of scope, log them): the AI-distilled extract step (a Claude Code `/atomize` skill that calls `planAtomize` for segmentation+context, has Claude write each note's distilled body/type, then `applyAtomize`); `update` action (merge into an existing note); atomicity-split flagging; per-segment type inference; folder routing by type.
