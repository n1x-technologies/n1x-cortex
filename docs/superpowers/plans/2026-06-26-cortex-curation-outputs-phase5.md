# Cortex Phase 5 — Curation & Outputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the methodology cycle with five thin commands over the proven engine — `gaps`, `dupes`, `verify` (read-only diagnostics) and `moc`, `doc` (reversible/regenerable producers).

**Architecture:** Each command = a pure compute/plan function in `src/curate/`, a `commands/<name>.ts` wrapper (`run*` + `format*`), and a `cli.ts` case. Diagnostics never write; `moc` reuses the 3.2/3.3 backup+undo; `doc` emits a Typst artifact into a git-ignored `outDir` using the shipped `templates/typst/` engine. Built in two waves: Wave 1 diagnostics, Wave 2 producers.

**Tech Stack:** Node 20 / TypeScript (ESM, `.js` import specifiers), vitest, the existing FTS index (`buildIndex`/`searchIndex`), `templates/typst/` (`typst` CLI on PATH). No new dependencies.

## Global Constraints

- **ESM imports use `.js` specifiers** even for `.ts` files. Repo convention.
- **No new runtime dependencies.** `node:fs`, `node:path`, `node:url`, `node:child_process` only.
- **Sources immutable:** no command writes under `config.sourcesDir`. `moc` realpath-gates its dest; `doc` writes only under `config.outDir`.
- **Diagnostics are read-only:** `gaps`/`dupes`/`verify` touch the filesystem for reads only.
- **Writers dry-run by default:** `moc` writes nothing without `--write`; reversible via `cortex undo` (backup on overwrite).
- **Schema-agnostic:** always use `config.fields` (`type`/`status`/`source`), `config.statusLifecycle`, `config.mocDir`. Never hard-code field names.
- **Deterministic output:** sort all report/list output stably (by score then path, or by path).
- **Test vault pattern:** `mkdtempSync(join(tmpdir(), 'cortex-<x>-'))`, `loadConfig(dir, [])`, matching `test/promote.test.ts`.
- Defaults (Task 1): `mocDir = '00-MOC'`, `dupeThreshold = 0.45`, `outDir = '.cortex/out'`.

---

## WAVE 1 — Diagnostics (read-only)

### Task 1: Config defaults (`mocDir`, `dupeThreshold`, `outDir`)

**Files:**
- Modify: `toolkit/src/types.ts` (CortexConfig interface)
- Modify: `toolkit/src/config.ts` (defaults object)
- Test: `toolkit/test/config-phase5.test.ts`

**Interfaces:**
- Produces: `CortexConfig` gains `mocDir: string`, `dupeThreshold: number`, `outDir: string`. Defaulted in `loadConfig`; overridable via `.cortex.json` (handled by the existing `...override` spread).

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/config-phase5.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('phase 5 config defaults', () => {
  it('provides mocDir/dupeThreshold/outDir defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cfg5-'));
    const c = loadConfig(dir, []);
    expect(c.mocDir).toBe('00-MOC');
    expect(c.dupeThreshold).toBe(0.45);
    expect(c.outDir).toBe('.cortex/out');
  });
  it('honors overrides from .cortex.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cfg5-'));
    writeFileSync(join(dir, '.cortex.json'), JSON.stringify({ mocDir: 'MOC', dupeThreshold: 0.6 }));
    const c = loadConfig(dir, []);
    expect(c.mocDir).toBe('MOC');
    expect(c.dupeThreshold).toBe(0.6);
    expect(c.outDir).toBe('.cortex/out');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/config-phase5.test.ts`
Expected: FAIL — `c.mocDir` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `toolkit/src/types.ts`, add three fields to `CortexConfig` (after `autonomy`):

```ts
  autonomy: 'off' | 'suggest' | 'auto-draft' | 'full';
  mocDir: string;
  dupeThreshold: number;
  outDir: string;
  viz: { port: number };
```

In `toolkit/src/config.ts`, add to the `defaults` object (after `autonomy: 'auto-draft',`):

```ts
    autonomy: 'auto-draft',
    mocDir: '00-MOC',
    dupeThreshold: 0.45,
    outDir: '.cortex/out',
    viz: { port: 4317 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/config-phase5.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/types.ts toolkit/src/config.ts toolkit/test/config-phase5.test.ts
git commit -m "feat(toolkit): Phase 5 config defaults (mocDir, dupeThreshold, outDir)"
```

---

### Task 2: `cortex gaps` — coverage report

**Files:**
- Create: `toolkit/src/curate/gaps.ts`
- Create: `toolkit/src/commands/gaps.ts`
- Modify: `toolkit/src/cli.ts` (import + `case 'gaps'` + usage)
- Test: `toolkit/test/gaps.test.ts`

**Interfaces:**
- Consumes: `scanVault`, `collectFrontmatterKeys` from `../vault.js`; `loadConfig` from `../config.js`; `snapshotSources`, `loadState` from `../hooks/state.js`; `CortexConfig` and `HookState`.
- Produces:
  - `interface GapsReport { unatomizedSources: string[]; staleSources: string[]; notesMissingCitation: string[]; stuckDrafts: string[] }`
  - `computeGaps(vaultDir: string, config: CortexConfig, state: HookState): GapsReport`
  - `runGaps(vaultDir: string): GapsReport`, `formatGaps(r: GapsReport): string`

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/gaps.test.ts
import { describe, it, expect } from 'vitest';
import { computeGaps } from '../src/curate/gaps.js';
import { loadConfig } from '../src/config.js';
import { freshState } from '../src/hooks/state.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-gaps-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'cited.md'), '# Cited source');
  writeFileSync(join(dir, 'Markdown', 'orphan.md'), '# Orphan source');   // no note cites it
  mkdirSync(join(dir, '01-Notes'));
  writeFileSync(join(dir, '01-Notes', 'a.md'), '---\nstatus: "draft"\nsource: "[[cited]]"\n---\n# A');     // cites cited.md, is a draft
  writeFileSync(join(dir, '01-Notes', 'b.md'), '---\nstatus: "verified"\n---\n# B');                        // no citation
  mkdirSync(join(dir, '00-MOC'));
  writeFileSync(join(dir, '00-MOC', 'index.md'), '---\ntype: "moc"\n---\n# Index');                         // MOC: excluded from missing-citation
  return dir;
}

describe('computeGaps', () => {
  it('classifies coverage buckets', () => {
    const dir = vault();
    const r = computeGaps(dir, loadConfig(dir, []), freshState());
    expect(r.unatomizedSources).toEqual(['Markdown/orphan.md']);   // cited.md is cited, orphan.md is not
    expect(r.notesMissingCitation).toEqual(['01-Notes/b.md']);     // b has no source; MOC index excluded
    expect(r.stuckDrafts).toEqual(['01-Notes/a.md']);              // a is a draft
    expect(r.staleSources).toEqual([]);                            // fresh state → no snapshot → none
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/gaps.test.ts`
Expected: FAIL — cannot find module `../src/curate/gaps.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/curate/gaps.ts
import { scanVault } from '../vault.js';
import { snapshotSources, type HookState } from '../hooks/state.js';
import type { CortexConfig } from '../types.js';

export interface GapsReport {
  unatomizedSources: string[];
  staleSources: string[];
  notesMissingCitation: string[];
  stuckDrafts: string[];
}

function sourceKey(s: string): string {
  return s.replace(/\[\[|\]\]/g, '').split(/[\\/]/).pop()!.replace(/\.md$/i, '').trim().toLowerCase();
}

export function computeGaps(vaultDir: string, config: CortexConfig, state: HookState): GapsReport {
  const notes = scanVault(vaultDir, config);
  const live = snapshotSources(vaultDir, config);
  const sourceRel = Object.keys(live);
  const citedKeys = new Set(notes.map(n => n.source).filter((s): s is string => !!s).map(sourceKey));

  const unatomizedSources = sourceRel.filter(rel => !citedKeys.has(sourceKey(rel))).sort();
  const staleSources = sourceRel
    .filter(rel => citedKeys.has(sourceKey(rel)) && state.sources[rel] !== undefined && live[rel] > state.sources[rel])
    .sort();
  const notesMissingCitation = notes
    .filter(n => n.source == null && n.type !== 'moc' && n.folder !== config.mocDir)
    .map(n => n.path).sort();
  const draft = config.statusLifecycle[0];
  const stuckDrafts = notes.filter(n => n.status === draft).map(n => n.path).sort();

  return { unatomizedSources, staleSources, notesMissingCitation, stuckDrafts };
}
```

```ts
// toolkit/src/commands/gaps.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { loadState } from '../hooks/state.js';
import { computeGaps, type GapsReport } from '../curate/gaps.js';

export function runGaps(vaultDir: string): GapsReport {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return computeGaps(vaultDir, config, loadState(vaultDir));
}

export function formatGaps(r: GapsReport): string {
  const lines: string[] = [];
  const section = (title: string, items: string[]) => {
    lines.push(`${title}: ${items.length}`);
    for (const i of items.slice(0, 30)) lines.push(`  • ${i}`);
  };
  section('Unatomized sources', r.unatomizedSources);
  section('Stale sources (changed since indexed)', r.staleSources);
  section('Notes missing citation', r.notesMissingCitation);
  section('Stuck drafts', r.stuckDrafts);
  return lines.join('\n');
}
```

In `toolkit/src/cli.ts`, add the import and a case before `default:`:

```ts
import { runGaps, formatGaps } from './commands/gaps.js';
```
```ts
    case 'gaps': {
      console.log(formatGaps(runGaps(cwd)));
      return 0;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/gaps.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/curate/gaps.ts toolkit/src/commands/gaps.ts toolkit/src/cli.ts toolkit/test/gaps.test.ts
git commit -m "feat(toolkit): cortex gaps — coverage report (read-only)"
```

---

### Task 3: `cortex dupes` — near-duplicate detection

**Files:**
- Create: `toolkit/src/curate/dupes.ts`
- Create: `toolkit/src/commands/dupes.ts`
- Modify: `toolkit/src/cli.ts` (import + `case 'dupes'` + usage)
- Test: `toolkit/test/dupes.test.ts`

**Interfaces:**
- Consumes: `scanVault` from `../vault.js`; `buildIndex` from `../search/index.js`; `loadConfig`, `collectFrontmatterKeys`.
- Produces:
  - `interface DupePair { a: string; b: string; score: number }`  (a < b by path; score 0..1, 2 decimals)
  - `computeDupes(vaultDir: string, config: CortexConfig, threshold: number): DupePair[]`
  - `runDupes(vaultDir: string, opts: { threshold?: number }): DupePair[]`, `formatDupes(pairs: DupePair[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/dupes.test.ts
import { describe, it, expect } from 'vitest';
import { computeDupes } from '../src/curate/dupes.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-dupes-'));
  mkdirSync(join(dir, 'N'));
  const text = '# Refund policy\n\nCustomers may request a refund within thirty days of purchase for any reason.';
  writeFileSync(join(dir, 'N', 'refund1.md'), text);
  writeFileSync(join(dir, 'N', 'refund2.md'), text + ' Refunds are processed within five business days.');
  writeFileSync(join(dir, 'N', 'unrelated.md'), '# Office hours\n\nThe office opens at nine in the morning on weekdays.');
  return dir;
}

describe('computeDupes', () => {
  it('pairs near-identical notes above threshold and excludes unrelated', () => {
    const pairs = computeDupes(vault(), loadConfig(vault(), []), 0.45);
    expect(pairs.length).toBe(1);
    expect([pairs[0].a, pairs[0].b].map(p => p.split('/').pop()).sort()).toEqual(['refund1.md', 'refund2.md']);
    expect(pairs[0].score).toBeGreaterThanOrEqual(0.45);
  });
  it('returns nothing when threshold is 1', () => {
    expect(computeDupes(vault(), loadConfig(vault(), []), 1).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/dupes.test.ts`
Expected: FAIL — cannot find module `../src/curate/dupes.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/curate/dupes.ts
import { scanVault } from '../vault.js';
import { buildIndex } from '../search/index.js';
import type { CortexConfig } from '../types.js';

export interface DupePair { a: string; b: string; score: number }

export function computeDupes(vaultDir: string, config: CortexConfig, threshold: number): DupePair[] {
  const notes = scanVault(vaultDir, config);
  const index = buildIndex(notes);
  const N = Math.max(1, notes.length);

  const vecs: Map<string, number>[] = [];
  const norms: number[] = [];
  const inverted = new Map<string, number[]>();
  notes.forEach((_, i) => {
    const terms = index.tf.get(i) ?? new Map<string, number>();
    const v = new Map<string, number>();
    let sumSq = 0;
    for (const [t, f] of terms) {
      const idf = Math.log(1 + N / (index.df.get(t) ?? 1));
      const w = f * idf;
      v.set(t, w);
      sumSq += w * w;
      (inverted.get(t) ?? inverted.set(t, []).get(t)!).push(i);
    }
    vecs[i] = v;
    norms[i] = Math.sqrt(sumSq) || 1;
  });

  const seen = new Set<string>();
  const pairs: DupePair[] = [];
  for (const idxs of inverted.values()) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x], j = idxs[y];
        if (i === j) continue;
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [small, large] = vecs[i].size < vecs[j].size ? [vecs[i], vecs[j]] : [vecs[j], vecs[i]];
        let dot = 0;
        for (const [t, w] of small) { const w2 = large.get(t); if (w2) dot += w * w2; }
        const cos = dot / (norms[i] * norms[j]);
        if (cos >= threshold) {
          const [a, b] = [notes[i].path, notes[j].path].sort();
          pairs.push({ a, b, score: Math.round(cos * 100) / 100 });
        }
      }
    }
  }
  return pairs.sort((p, q) => q.score - p.score || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
}
```

```ts
// toolkit/src/commands/dupes.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { computeDupes, type DupePair } from '../curate/dupes.js';

export function runDupes(vaultDir: string, opts: { threshold?: number }): DupePair[] {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return computeDupes(vaultDir, config, opts.threshold ?? config.dupeThreshold);
}

export function formatDupes(pairs: DupePair[]): string {
  if (!pairs.length) return 'No near-duplicate notes found.';
  const lines = [`Near-duplicate pairs (merge candidates): ${pairs.length}`];
  for (const p of pairs.slice(0, 50)) lines.push(`  ${p.score.toFixed(2)}  ${p.a}  ⇄  ${p.b}`);
  return lines.join('\n');
}
```

In `toolkit/src/cli.ts`, add the import and a case before `default:`:

```ts
import { runDupes, formatDupes } from './commands/dupes.js';
```
```ts
    case 'dupes': {
      const ti = argv.indexOf('--threshold');
      const threshold = ti >= 0 ? Number(argv[ti + 1]) : undefined;
      console.log(formatDupes(runDupes(cwd, { threshold })));
      return 0;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/dupes.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/curate/dupes.ts toolkit/src/commands/dupes.ts toolkit/src/cli.ts toolkit/test/dupes.test.ts
git commit -m "feat(toolkit): cortex dupes — near-duplicate detection (cosine over tf-idf)"
```

---

### Task 4: `cortex verify <note>` — link-closure completeness

**Files:**
- Create: `toolkit/src/curate/verify.ts`
- Create: `toolkit/src/commands/verify.ts`
- Modify: `toolkit/src/cli.ts` (import + `case 'verify'` + usage)
- Test: `toolkit/test/verify.test.ts`

**Interfaces:**
- Consumes: `scanVault`; `Note` from `../types.js`; `basename` from `node:path`.
- Produces:
  - `interface VerifyItem { target: string; exists: boolean; cited: boolean; verified: boolean }`
  - `interface VerifyReport { root: string; hops: number; items: VerifyItem[]; ok: boolean }`
  - `verifyNote(vaultDir: string, config: CortexConfig, notePath: string, hops: number): VerifyReport`
  - `runVerify(vaultDir: string, notePath: string, opts: { hops?: number }): VerifyReport`, `formatVerify(r: VerifyReport): string`

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/verify.test.ts
import { describe, it, expect } from 'vitest';
import { verifyNote } from '../src/curate/verify.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-verify-'));
  mkdirSync(join(dir, 'N'));
  // flow links to rule1 (exists, cited, verified) and rule2 (a gap)
  writeFileSync(join(dir, 'N', 'flow.md'), '---\nstatus: "draft"\n---\n# Flow\n\nSee [[rule1]] and [[rule2]].');
  writeFileSync(join(dir, 'N', 'rule1.md'), '---\nstatus: "verified"\nsource: "[[src]]"\n---\n# Rule1');
  return dir;
}

describe('verifyNote', () => {
  it('builds a completeness checklist over the link closure', () => {
    const dir = vault();
    const r = verifyNote(dir, loadConfig(dir, []), 'N/flow.md', 2);
    const byTarget = Object.fromEntries(r.items.map(i => [i.target, i]));
    expect(byTarget['rule1']).toEqual({ target: 'rule1', exists: true, cited: true, verified: true });
    expect(byTarget['rule2']).toEqual({ target: 'rule2', exists: false, cited: false, verified: false });
    expect(r.ok).toBe(false);   // rule2 is a gap
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/verify.test.ts`
Expected: FAIL — cannot find module `../src/curate/verify.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/curate/verify.ts
import { basename } from 'node:path';
import { scanVault } from '../vault.js';
import type { CortexConfig, Note } from '../types.js';

export interface VerifyItem { target: string; exists: boolean; cited: boolean; verified: boolean }
export interface VerifyReport { root: string; hops: number; items: VerifyItem[]; ok: boolean }

function stem(p: string): string { return basename(p).replace(/\.md$/i, ''); }

export function verifyNote(vaultDir: string, config: CortexConfig, notePath: string, hops: number): VerifyReport {
  const notes = scanVault(vaultDir, config);
  const resolver = new Map<string, Note>();
  for (const n of notes) {
    for (const k of [n.id, n.title, stem(n.path)]) if (k) resolver.set(k, n);
  }
  const root = notes.find(n => n.path === notePath || stem(n.path) === stem(notePath));
  if (!root) return { root: notePath, hops, items: [], ok: false };

  const last = config.statusLifecycle[config.statusLifecycle.length - 1];
  const items: VerifyItem[] = [];
  const visited = new Set<string>([root.id, root.title, stem(root.path)]);
  let frontier: Note[] = [root];
  for (let h = 0; h < hops; h++) {
    const next: Note[] = [];
    for (const note of frontier) {
      for (const link of note.links) {
        const t = link.target;
        if (visited.has(t)) continue;
        visited.add(t);
        const resolved = resolver.get(t);
        if (resolved) {
          items.push({ target: t, exists: true, cited: resolved.source != null, verified: resolved.status === last });
          next.push(resolved);
        } else {
          items.push({ target: t, exists: false, cited: false, verified: false });
        }
      }
    }
    frontier = next;
  }
  return { root: root.path, hops, items, ok: items.every(i => i.exists) };
}
```

```ts
// toolkit/src/commands/verify.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { verifyNote, type VerifyReport } from '../curate/verify.js';

export function runVerify(vaultDir: string, notePath: string, opts: { hops?: number }): VerifyReport {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return verifyNote(vaultDir, config, notePath, opts.hops ?? 2);
}

export function formatVerify(r: VerifyReport): string {
  const gaps = r.items.filter(i => !i.exists).length;
  const lines = [`Verify: ${r.root}  ·  ${r.items.length} linked target(s) · ${gaps} gap(s) · ${r.ok ? 'OK' : 'INCOMPLETE'}`];
  for (const i of r.items) {
    const mark = (b: boolean) => (b ? '✓' : '✗');
    lines.push(`  ${mark(i.exists)} exists  ${mark(i.cited)} cited  ${mark(i.verified)} verified   ${i.target}`);
  }
  return lines.join('\n');
}
```

In `toolkit/src/cli.ts`, add the import and a case before `default:`:

```ts
import { runVerify, formatVerify } from './commands/verify.js';
```
```ts
    case 'verify': {
      const rest = argv.slice(1);
      const hi = rest.indexOf('--hops');
      const hops = hi >= 0 ? Number(rest[hi + 1]) : undefined;
      const note = rest.filter(a => !a.startsWith('--') && a !== String(hops))[0];
      if (!note) { console.log('Usage: cortex verify <note.md> [--hops N]'); return 1; }
      console.log(formatVerify(runVerify(cwd, note, { hops })));
      return 0;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/verify.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/curate/verify.ts toolkit/src/commands/verify.ts toolkit/src/cli.ts toolkit/test/verify.test.ts
git commit -m "feat(toolkit): cortex verify — link-closure completeness checklist"
```

---

### Task 5: Wave-1 close — full suite + build

**Files:** none (verification gate).

- [ ] **Step 1: Run the full suite and build**

Run: `cd toolkit && npx vitest run && npm run build && npx tsc --noEmit`
Expected: all tests PASS; build clean; typecheck clean.

- [ ] **Step 2: Smoke the three diagnostics**

```bash
cd toolkit && node dist/cli.js gaps >/dev/null && node dist/cli.js dupes >/dev/null && echo "diagnostics run"
```
Expected: prints `diagnostics run` (commands execute against the repo's own markdown without error).

- [ ] **Step 3: Commit (if build produced no tracked changes, skip)**

```bash
git status --short
# no commit needed unless build artifacts are tracked (they are not — dist/ is git-ignored)
```

---

## WAVE 2 — Producers (write / output)

### Task 6: `md2typ` — minimal markdown→Typst converter

**Files:**
- Create: `toolkit/src/curate/md2typ.ts`
- Test: `toolkit/test/md2typ.test.ts`

**Interfaces:**
- Produces: `mdToTyp(markdown: string, headingShift: number): string` — converts headings (depth-shifted), bullet lists, bold/italic, inline code, and `[[wikilinks]]` (→ Typst bold), escaping stray Typst specials (`#`, `$`, `@`).

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/md2typ.test.ts
import { describe, it, expect } from 'vitest';
import { mdToTyp } from '../src/curate/md2typ.js';

describe('mdToTyp', () => {
  it('shifts headings by the given amount', () => {
    expect(mdToTyp('# Title', 1)).toBe('== Title');
    expect(mdToTyp('## Sub', 1)).toBe('=== Sub');
  });
  it('converts emphasis, wikilinks, and bullets', () => {
    expect(mdToTyp('**bold**', 0)).toBe('*bold*');
    expect(mdToTyp('*italic*', 0)).toBe('_italic_');
    expect(mdToTyp('[[Note|Alias]]', 0)).toBe('*Alias*');
    expect(mdToTyp('[[Note]]', 0)).toBe('*Note*');
    expect(mdToTyp('- item', 0)).toBe('- item');
  });
  it('escapes stray Typst specials', () => {
    expect(mdToTyp('cost is #5 and @ten', 0)).toBe('cost is \\#5 and \\@ten');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/md2typ.test.ts`
Expected: FAIL — cannot find module `../src/curate/md2typ.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/curate/md2typ.ts
const B = '';   // bold placeholder
const I = '';   // italic placeholder

function inline(text: string): string {
  let t = text;
  // emphasis & wikilinks → placeholders (so escaping doesn't touch their markers)
  t = t.replace(/\*\*([^*]+)\*\*/g, (_m, c) => `${B}${c}${B}`);
  t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => `${B}${(b ?? a).trim()}${B}`);
  t = t.replace(/(?<![\\\w*])\*([^*]+)\*/g, (_m, c) => `${I}${c}${I}`);
  t = t.replace(/(?<![\\\w])_([^_]+)_/g, (_m, c) => `${I}${c}${I}`);
  // escape stray Typst specials in the remaining literal text
  t = t.replace(/([#$@])/g, '\\$1');
  // render placeholders as Typst markup
  t = t.replace(new RegExp(`${B}([^${B}]*)${B}`, 'g'), '*$1*');
  t = t.replace(new RegExp(`${I}([^${I}]*)${I}`, 'g'), '_$1_');
  return t;
}

export function mdToTyp(markdown: string, headingShift: number): string {
  return markdown.split('\n').map(line => {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + headingShift, 6);
      return '='.repeat(level) + ' ' + inline(h[2]);
    }
    const b = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (b) return `${b[1]}- ${inline(b[2])}`;
    if (line.trim() === '') return '';
    return inline(line);
  }).join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/md2typ.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/curate/md2typ.ts toolkit/test/md2typ.test.ts
git commit -m "feat(toolkit): md2typ — minimal markdown→Typst converter"
```

---

### Task 7: `cortex moc <topic>` — (re)generate a Map of Content

**Files:**
- Create: `toolkit/src/curate/moc.ts`
- Create: `toolkit/src/commands/moc.ts`
- Modify: `toolkit/src/cli.ts` (import + `case 'moc'` + usage)
- Test: `toolkit/test/moc.test.ts`

**Interfaces:**
- Consumes: `scanVault`; `backupNote` from `../atomize/backup.js`; `Note`, `CortexConfig`; `node:fs` (`existsSync`, `mkdirSync`, `writeFileSync`), `node:path` (`join`, `dirname`, `resolve`, `sep`).
- Produces:
  - `interface MocGroup { name: string; entries: { id: string; title: string }[] }`
  - `interface MocPlan { topic: string; dest: string; groups: MocGroup[]; count: number }`
  - `selectTopicNotes(notes: Note[], config: CortexConfig, topic: string): Note[]`  (exported; reused by `doc`)
  - `planMoc(vaultDir: string, config: CortexConfig, topic: string): MocPlan`
  - `renderMoc(plan: MocPlan): string`
  - `applyMoc(vaultDir: string, plan: MocPlan, config: CortexConfig, opts: { dryRun?: boolean; runId?: string }): { written: string | null; backup: string | null }`

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/moc.test.ts
import { describe, it, expect } from 'vitest';
import { planMoc, applyMoc, renderMoc } from '../src/curate/moc.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-moc-'));
  mkdirSync(join(dir, 'Rules'));
  writeFileSync(join(dir, 'Rules', 'r1.md'), '---\ntype: "rule"\ntags: ["refunds"]\n---\n# Refund window');
  writeFileSync(join(dir, 'Rules', 'r2.md'), '---\ntype: "rule"\ntags: ["refunds"]\n---\n# Refund method');
  writeFileSync(join(dir, 'Rules', 'other.md'), '---\ntype: "rule"\ntags: ["shipping"]\n---\n# Shipping');
  return dir;
}

describe('planMoc', () => {
  it('selects notes by tag and groups them', () => {
    const dir = vault();
    const plan = planMoc(dir, loadConfig(dir, []), 'refunds');
    expect(plan.count).toBe(2);
    expect(plan.dest).toBe('00-MOC/refunds.md');
    expect(renderMoc(plan)).toContain('[[r1|Refund window]]');
  });
});

describe('applyMoc', () => {
  it('dry-runs by default and writes + backs up on --write', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const plan = planMoc(dir, cfg, 'refunds');
    expect(applyMoc(dir, plan, cfg, { dryRun: true }).written).toBe(null);
    expect(existsSync(join(dir, '00-MOC', 'refunds.md'))).toBe(false);

    const first = applyMoc(dir, plan, cfg, { dryRun: false, runId: 'run1' });
    expect(first.written).toBe('00-MOC/refunds.md');
    expect(first.backup).toBe(null);                                   // new file → no backup
    expect(readFileSync(join(dir, '00-MOC', 'refunds.md'), 'utf8')).toContain('type: moc');

    const second = applyMoc(dir, plan, cfg, { dryRun: false, runId: 'run2' });
    expect(second.backup).not.toBe(null);                              // overwrite → backed up
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/moc.test.ts`
Expected: FAIL — cannot find module `../src/curate/moc.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/curate/moc.ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { scanVault } from '../vault.js';
import { backupNote } from '../atomize/backup.js';
import type { CortexConfig, Note } from '../types.js';

export interface MocGroup { name: string; entries: { id: string; title: string }[] }
export interface MocPlan { topic: string; dest: string; groups: MocGroup[]; count: number }

export function selectTopicNotes(notes: Note[], config: CortexConfig, topic: string): Note[] {
  const t = topic.toLowerCase();
  return notes.filter(n =>
    n.folder !== config.mocDir &&
    (n.tags.some(tag => tag.toLowerCase() === t) || (n.type ?? '').toLowerCase() === t || n.folder.toLowerCase() === t),
  );
}

export function planMoc(vaultDir: string, config: CortexConfig, topic: string): MocPlan {
  const selected = selectTopicNotes(scanVault(vaultDir, config), config, topic);
  const byGroup = new Map<string, { id: string; title: string }[]>();
  for (const n of selected) {
    const name = n.type ?? n.folder;
    (byGroup.get(name) ?? byGroup.set(name, []).get(name)!).push({ id: n.id, title: n.title });
  }
  const groups: MocGroup[] = [...byGroup.entries()]
    .map(([name, entries]) => ({ name, entries: entries.sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { topic, dest: `${config.mocDir}/${topic}.md`, groups, count: selected.length };
}

export function renderMoc(plan: MocPlan): string {
  const lines = [
    '---',
    'type: moc',
    'status: draft',
    `title: "${plan.topic} — MOC"`,
    '---',
    '',
    `# ${plan.topic} — MOC`,
    '',
    `Map of content for **${plan.topic}** · ${plan.count} note(s).`,
    '',
  ];
  for (const g of plan.groups) {
    lines.push(`## ${g.name}`, '');
    for (const e of g.entries) lines.push(`- [[${e.id}|${e.title}]]`);
    lines.push('');
  }
  return lines.join('\n');
}

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function applyMoc(
  vaultDir: string,
  plan: MocPlan,
  config: CortexConfig,
  opts: { dryRun?: boolean; runId?: string } = {},
): { written: string | null; backup: string | null } {
  const dryRun = opts.dryRun ?? true;
  if (dryRun) return { written: null, backup: null };

  const abs = resolve(vaultDir, plan.dest);
  const sourcesAbs = resolve(vaultDir, config.sourcesDir.replace(/\/$/, ''));
  if (abs === sourcesAbs || abs.startsWith(sourcesAbs + sep)) return { written: null, backup: null };

  const runId = opts.runId ?? makeRunId();
  const backup = existsSync(abs) ? backupNote(vaultDir, plan.dest, runId) : null;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, renderMoc(plan));
  return { written: plan.dest, backup };
}
```

```ts
// toolkit/src/commands/moc.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { planMoc, applyMoc, type MocPlan } from '../curate/moc.js';

export function runMoc(vaultDir: string, topic: string, opts: { write?: boolean }): {
  plan: MocPlan; written: string | null; backup: string | null; dryRun: boolean;
} {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const plan = planMoc(vaultDir, config, topic);
  const { written, backup } = applyMoc(vaultDir, plan, config, { dryRun: !opts.write });
  return { plan, written, backup, dryRun: !opts.write };
}

export function formatMoc(r: ReturnType<typeof runMoc>): string {
  const lines = [`MOC: ${r.plan.topic}  ·  ${r.plan.count} note(s) · ${r.plan.groups.length} group(s) → ${r.plan.dest}`];
  lines.push(r.dryRun ? '(dry-run — nothing written; pass --write to apply)'
    : `wrote ${r.written}${r.backup ? ` (backed up prior version)` : ''}`);
  for (const g of r.plan.groups) lines.push(`  ## ${g.name} (${g.entries.length})`);
  return lines.join('\n');
}
```

In `toolkit/src/cli.ts`, add the import and a case before `default:`:

```ts
import { runMoc, formatMoc } from './commands/moc.js';
```
```ts
    case 'moc': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const topic = rest.filter(a => !a.startsWith('--'))[0];
      if (!topic) { console.log('Usage: cortex moc <topic> [--write]'); return 1; }
      console.log(formatMoc(runMoc(cwd, topic, { write })));
      return 0;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/moc.test.ts && npx tsc --noEmit`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/curate/moc.ts toolkit/src/commands/moc.ts toolkit/src/cli.ts toolkit/test/moc.test.ts
git commit -m "feat(toolkit): cortex moc — (re)generate a Map of Content note (reversible)"
```

---

### Task 8: `cortex doc <topic>` — consolidate notes → Typst (+ optional PDF)

**Files:**
- Create: `toolkit/src/curate/doc.ts`
- Create: `toolkit/src/commands/doc.ts`
- Modify: `toolkit/src/cli.ts` (import + `case 'doc'` + usage)
- Modify: `.gitignore` (add `.cortex/out/`)
- Modify: `toolkit/scripts/copy-static.mjs` (none) — N/A
- Test: `toolkit/test/doc.test.ts`

**Interfaces:**
- Consumes: `scanVault`; `selectTopicNotes` from `../curate/moc.js`; `mdToTyp` from `../curate/md2typ.js`; `Note`, `CortexConfig`; `node:fs`, `node:path`, `node:url` (`fileURLToPath`), `node:child_process` (`execFileSync`).
- Produces:
  - `interface DocPlan { topic: string; notes: { title: string; body: string }[]; dest: string }`
  - `planDoc(vaultDir: string, config: CortexConfig, topic: string): DocPlan`
  - `renderDocTyp(plan: DocPlan, config: CortexConfig): string`
  - `runDoc(vaultDir: string, topic: string, opts: { pdf?: boolean }): { dest: string; pdf: string | null; compiled: boolean }`
  - `formatDoc(r: ReturnType<typeof runDoc>): string`

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/doc.test.ts
import { describe, it, expect } from 'vitest';
import { planDoc, renderDocTyp, runDoc } from '../src/curate/doc.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-doc-'));
  mkdirSync(join(dir, 'Rules'));
  writeFileSync(join(dir, 'Rules', 'r1.md'), '---\ntype: "rule"\ntags: ["refunds"]\n---\n# Refund window\n\nThirty days.');
  return dir;
}

describe('planDoc + renderDocTyp', () => {
  it('selects topic notes and emits a valid .typ', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const plan = planDoc(dir, cfg, 'refunds');
    expect(plan.notes.length).toBe(1);
    const typ = renderDocTyp(plan, cfg);
    expect(typ).toContain('#import "template.typ": *');
    expect(typ).toContain('doc.with(');
    expect(typ).toContain('= Refund window');
  });
});

describe('runDoc', () => {
  it('writes the .typ and template files into outDir (no --pdf → not compiled)', () => {
    const dir = vault();
    const r = runDoc(dir, 'refunds', { pdf: false });
    expect(r.compiled).toBe(false);
    expect(r.pdf).toBe(null);
    expect(existsSync(join(dir, '.cortex', 'out', 'refunds.typ'))).toBe(true);
    expect(existsSync(join(dir, '.cortex', 'out', 'template.typ'))).toBe(true);
    expect(readFileSync(join(dir, '.cortex', 'out', 'refunds.typ'), 'utf8')).toContain('= Refund window');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npx vitest run test/doc.test.ts`
Expected: FAIL — cannot find module `../src/curate/doc.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// toolkit/src/curate/doc.ts
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scanVault } from '../vault.js';
import { selectTopicNotes } from './moc.js';
import { mdToTyp } from './md2typ.js';
import type { CortexConfig, Note } from '../types.js';

export interface DocPlan { topic: string; notes: { title: string; body: string }[]; dest: string }

// Resolve the shipped Typst template dir (repo-root/templates/typst), valid from src/ and dist/.
const TEMPLATE_DIR = fileURLToPath(new URL('../../../templates/typst', import.meta.url));

function orderByMoc(vaultDir: string, config: CortexConfig, topic: string, selected: Note[]): Note[] {
  const mocPath = resolve(vaultDir, `${config.mocDir}/${topic}.md`);
  if (!existsSync(mocPath)) return selected;
  const moc = readFileSync(mocPath, 'utf8');
  const order: string[] = [];
  for (const m of moc.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) order.push(m[1].trim());
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...selected].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
}

export function planDoc(vaultDir: string, config: CortexConfig, topic: string): DocPlan {
  const selected = selectTopicNotes(scanVault(vaultDir, config), config, topic);
  const ordered = orderByMoc(vaultDir, config, topic, selected);
  return {
    topic,
    notes: ordered.map(n => ({ title: n.title, body: n.body })),
    dest: `${config.outDir}/${topic}.typ`,
  };
}

export function renderDocTyp(plan: DocPlan, config: CortexConfig): string {
  const year = String(new Date().getFullYear());
  const lang = config.lang ?? 'en';
  const head = [
    '#import "template.typ": *',
    '#show: doc.with(',
    `  title: "${plan.topic}",`,
    '  doc-label: "Cortex",',
    '  client: "N1X Technologies",',
    `  date: "${year}",`,
    `  lang: "${lang}",`,
    ')',
    '',
  ];
  const body = plan.notes.map(n => `= ${n.title}\n\n${mdToTyp(n.body, 0)}`).join('\n\n');
  return head.join('\n') + '\n' + body + '\n';
}

export function runDoc(vaultDir: string, topic: string, opts: { pdf?: boolean }): {
  dest: string; pdf: string | null; compiled: boolean;
} {
  const config = (function () {
    // local import to avoid a cycle; loadConfig is cheap
    return require('../config.js').loadConfig(vaultDir, require('../vault.js').collectFrontmatterKeys(vaultDir));
  })() as CortexConfig;
  const plan = planDoc(vaultDir, config, topic);
  const outAbs = resolve(vaultDir, config.outDir);
  mkdirSync(outAbs, { recursive: true });
  for (const f of ['template.typ', 'brand.typ']) copyFileSync(join(TEMPLATE_DIR, f), join(outAbs, f));
  const destAbs = resolve(vaultDir, plan.dest);
  writeFileSync(destAbs, renderDocTyp(plan, config));

  let pdf: string | null = null;
  let compiled = false;
  if (opts.pdf) {
    const pdfAbs = destAbs.replace(/\.typ$/, '.pdf');
    try {
      execFileSync('typst', ['compile', destAbs, pdfAbs], { stdio: 'ignore' });
      pdf = `${config.outDir}/${topic}.pdf`;
      compiled = true;
    } catch {
      compiled = false;   // typst missing or compile error → leave the .typ for manual compile
    }
  }
  return { dest: plan.dest, pdf, compiled };
}

export function formatDoc(r: ReturnType<typeof runDoc>): string {
  const lines = [`Doc → ${r.dest}`];
  if (r.compiled && r.pdf) lines.push(`Compiled PDF → ${r.pdf}`);
  else lines.push(`To build the PDF: typst compile ${r.dest} ${r.dest.replace(/\.typ$/, '.pdf')}`);
  return lines.join('\n');
}
```

> Note: `runDoc` uses `require(...)` for `loadConfig`/`collectFrontmatterKeys` only to keep `doc.ts` free of a config import cycle. If your build is strict ESM and `require` is unavailable, replace the IIFE with top-level `import { loadConfig } from '../config.js'` and `import { collectFrontmatterKeys } from '../vault.js'` — there is no actual cycle, so the plain import is preferred. **Use the plain import.**

Replace the `runDoc` config block with the plain-import form:

```ts
// at top of doc.ts, add:
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
// and inside runDoc, replace the IIFE with:
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
```

```ts
// toolkit/src/commands/doc.ts
import { runDoc, formatDoc } from '../curate/doc.js';
export { runDoc, formatDoc };
```

In `toolkit/src/cli.ts`, add the import and a case before `default:`:

```ts
import { runDoc, formatDoc } from './commands/doc.js';
```
```ts
    case 'doc': {
      const rest = argv.slice(1);
      const pdf = rest.includes('--pdf');
      const topic = rest.filter(a => !a.startsWith('--'))[0];
      if (!topic) { console.log('Usage: cortex doc <topic> [--pdf]'); return 1; }
      console.log(formatDoc(runDoc(cwd, topic, { pdf })));
      return 0;
    }
```

Update the `default:` usage string to the full command list:

```ts
      console.log('Usage: cortex <init|status|orphans|viz|query|atomize|promote|undo|set-status|hook|pause|resume|gaps|dupes|verify|moc|doc>');
```

Add to the repo-root `.gitignore`:

```
.cortex/out/
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npx vitest run test/doc.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/curate/doc.ts toolkit/src/commands/doc.ts toolkit/src/cli.ts toolkit/test/doc.test.ts .gitignore
git commit -m "feat(toolkit): cortex doc — consolidate notes → Typst (+ optional PDF)"
```

---

### Task 9: Wave-2 close — docs, full suite, smoke

**Files:**
- Modify: `README.md` (What it does today + CLI verbs + roadmap `Phase 5 ✓`)
- Modify: `CLAUDE.md` (toolkit row: new verbs, `Phases 0–5`)

- [ ] **Step 1: Update README**

In `README.md`, add a "Curation & outputs" row to the toolkit "What it does today" table describing `gaps`/`dupes`/`verify`/`moc`/`doc`. Extend the engine CLI verb line to include `gaps · dupes · verify · moc · doc`. Add roadmap entry: `Phase 5 ✓ — Curation & outputs: gaps · dupes · verify · moc · doc (Typst).`

- [ ] **Step 2: Update CLAUDE.md**

In the `toolkit/` File-inventory row, append `· gaps · dupes · verify · moc · doc` to the CLI list, add a clause: `Phase 5 adds the curation layer — read-only diagnostics (gaps/dupes/verify) and producers (moc writes a reversible Map-of-Content note; doc consolidates a topic's notes into a branded Typst PDF via templates/typst/).` Bump the phase range to `Phases 0–5`.

- [ ] **Step 3: Full suite + build + manual smoke**

Run: `cd toolkit && npx vitest run && npm run build && npx tsc --noEmit`
Expected: all tests PASS; build clean; typecheck clean.

Manual smoke against the repo's own `Markdown` (or a temp vault):
```bash
cd toolkit && node dist/cli.js moc Strategy && node dist/cli.js doc Strategy && echo "producers run"
```
Expected: `moc` prints a dry-run plan; `doc` writes `.cortex/out/Strategy.typ`; prints `producers run`. (If `typst` is installed, `node dist/cli.js doc Strategy --pdf` produces a PDF.)

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(toolkit): README/CLAUDE Phase 5 (curation & outputs)"
```

- [ ] **Step 5: Push + PR (manual final step)**

```bash
git push -u origin feat/cortex-curation-outputs-phase5
gh pr create --fill
```

---

## Self-Review

**Spec coverage:**
- §3 config keys → Task 1. ✓
- §4 `gaps` (4 buckets) → Task 2. ✓
- §5 `dupes` (cosine, threshold, suggest-only) → Task 3. ✓
- §6 `verify` (BFS closure, exists/cited/verified, hops) → Task 4. ✓
- §7 `moc` (selection union, grouping, dry-run, backup+undo, source-immutable gate) → Task 7. ✓
- §8 `doc` (selection, MOC ordering, `renderDocTyp`, md2typ, outDir, optional PDF, brand) → Tasks 6 + 8. ✓
- §8 `md2typ` → Task 6. ✓
- §9 safety (sources immutable, read-only diagnostics, moc reversible, doc regenerable) → enforced in Tasks 2–4 (no writes), 7 (gate+backup), 8 (outDir only). ✓
- §11 testing → each task's test; Wave gates at Tasks 5, 9. ✓
- §12 file structure → matches Tasks 2–8. ✓
- Docs (README/CLAUDE per convention) → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The `doc.ts` `require` IIFE is explicitly replaced with the plain-import form (the directed instruction is "use the plain import"). ✓

**Type consistency:** `GapsReport`, `DupePair`, `VerifyItem`/`VerifyReport`, `MocPlan`/`MocGroup`, `DocPlan` defined once and reused. `selectTopicNotes` defined in `moc.ts` (Task 7) and consumed by `doc.ts` (Task 8) with matching signature `(notes, config, topic)`. `mdToTyp(markdown, headingShift)` defined Task 6, consumed Task 8. `loadConfig` default keys (Task 1) consumed by every command. `snapshotSources`/`HookState`/`loadState` reused from Phase 4 in Task 2. `backupNote(vaultDir, relPath, runId)` reused from 3.2 in Task 7. ✓

**Ordering note:** Task 8 (`doc`) consumes `selectTopicNotes` from Task 7 (`moc`) and `mdToTyp` from Task 6 — Wave 2 must run 6 → 7 → 8 in order. Wave 1 runs 1 → 2 → 3 → 4 (Task 1 first; 2–4 independent but share the config from Task 1).
