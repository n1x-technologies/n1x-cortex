# Cortex Atomize 3.3 (the `promote` action) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cortex promote` — graduate *ready* drafts (status advanced beyond `draft`) out of `_inbox/<folder>/` into their curated folder, autonomously and reversibly — plus the `set-status` primitive that advances a note's status, and a generalized `cortex undo` that reverses the latest run (edit, status patch, or promotion).

**Architecture:** Builds on Phase 3.2's reversibility (`.cortex/backups/`, `backupNote`, `restoreLatestBackup`). `set-status` reuses the edit-backup path; `promote` records a move journal under `.cortex/promotions/`; `undoLatestRun` dispatches on whichever run was latest. Deterministic engine, no LLM dependency.

**Tech Stack:** Node ≥ 20, TypeScript (ESM), vitest. `gray-matter` already a dependency (via `parseFrontmatter`). No new dependencies.

## Global Constraints

- **Builds on Phase 3/3.1/3.2** (`toolkit/`): reuse `loadConfig`, `scanVault`, `collectFrontmatterKeys`, `backupNote`, `restoreLatestBackup`, the realpath safety pattern, and the existing types.
- **ESM** (`.js` import extensions), Node ≥ 20. Tool language English. Package root `toolkit/`.
- **WRITE-SAFETY:**
  - **Sources immutable** — neither `set-status` nor `promote` may write under `config.sourcesDir` (`Markdown/`); enforced realpath-based.
  - **In-vault only** — every target must resolve inside the vault.
  - **Never clobbers** — `promote` skips when the curated destination already exists.
  - **Draft barrier intact** — notes are still created as `draft`; only an advanced `status` (≠ `statusLifecycle[0]`) is eligible to promote.
  - **Dry-run by default** — `set-status`/`promote` write nothing (and take no backup) unless `--write`.
  - **Reversible** — `set-status` backs up before patching; `promote` records a move journal; `cortex undo` reverses the latest run; **idempotent** (a promoted note left `_inbox/` so re-running is a no-op).
- **Runs are timestamp-id'd** via `new Date().toISOString().replace(/[:.]/g,'-')` (Node `Date` is fine in the toolkit). Tests pass an explicit `runId` for determinism.
- **Tests:** TDD for every module; write paths tested against temp vaults and assert dry-run changes nothing.

---

## File Structure

```
toolkit/
├── src/atomize/
│   ├── set-status.ts            — setStatus + patchStatus (reversible status patch) (new)
│   ├── promote.ts               — planPromote / applyPromote (new)
│   └── backup.ts                — recordPromotions + undoLatestRun (modify)
├── src/commands/
│   ├── promote.ts               — runPromote / formatPromote / runSetStatus (new)
│   └── atomize.ts               — repoint runUndo → undoLatestRun (modify)
├── src/cli.ts                   — promote / undo / set-status cases; atomize --undo alias (modify)
├── skills/atomize/SKILL.md      — loop-closing: set-status → promote → undo (modify)
└── test/
    ├── set-status.test.ts       — (new)
    ├── promote.test.ts          — (new)
    ├── backup.test.ts           — undoLatestRun dispatch (modify)
    └── atomize.test.ts          — runPromote/runSetStatus/runUndo (modify)
```

---

### Task 1: `set-status` — reversible status advance

**Files:**
- Create: `toolkit/src/atomize/set-status.ts`
- Test: `toolkit/test/set-status.test.ts`

**Interfaces:**
- Consumes: `backupNote` (backup.js), `CortexConfig` (types.js).
- Produces: `setStatus(vaultDir: string, notePath: string, newStatus: string, config: CortexConfig, opts?: { dryRun?: boolean; runId?: string }): { changed: string | null; backup: string | null; skipped?: { target: string; reason: string } }` — patches ONLY the `config.fields.status` line in the note's frontmatter (rest verbatim; inserts the line if absent). Gates: in-vault, exists, not under `sourcesDir` (realpath). Dry-run writes nothing/no backup; `--write` backs up then patches.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/set-status.test.ts
import { describe, it, expect } from 'vitest';
import { setStatus } from '../src/atomize/set-status.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-ss-'));
  mkdirSync(join(dir, '01-Concepts'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, '01-Concepts', 'n.md'), '---\ntype: concept\nid: n\nstatus: "draft"\n---\n# N\n\nbody\n');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# src');
  return dir;
}

describe('setStatus', () => {
  it('dry-runs by default: no write, no backup', () => {
    const dir = vault();
    const r = setStatus(dir, '01-Concepts/n.md', 'documented', loadConfig(dir, []), { dryRun: true });
    expect(r.changed).toBeNull();
    expect(existsSync(join(dir, '.cortex'))).toBe(false);
    expect(readFileSync(join(dir, '01-Concepts', 'n.md'), 'utf8')).toContain('status: "draft"');
  });

  it('patches only the status line and backs up (rest of frontmatter verbatim)', () => {
    const dir = vault();
    const r = setStatus(dir, '01-Concepts/n.md', 'documented', loadConfig(dir, []), { dryRun: false, runId: 'RUN1' });
    expect(r.changed).toBe('01-Concepts/n.md');
    expect(r.backup).toBe('.cortex/backups/RUN1/01-Concepts/n.md');
    const after = readFileSync(join(dir, '01-Concepts', 'n.md'), 'utf8');
    expect(after).toContain('status: "documented"');
    expect(after).not.toContain('status: "draft"');
    expect(after).toMatch(/type: concept\nid: n/); // other frontmatter untouched
    expect(after).toContain('# N\n\nbody');         // body untouched
  });

  it('blocks Markdown/ targets, missing targets, and inserts status when absent', () => {
    const dir = vault();
    expect(setStatus(dir, 'Markdown/src.md', 'documented', loadConfig(dir, []), { dryRun: false }).skipped?.reason).toBe('source-immutable');
    expect(setStatus(dir, '01-Concepts/missing.md', 'documented', loadConfig(dir, []), { dryRun: false }).skipped?.reason).toBe('not-found');
    writeFileSync(join(dir, '01-Concepts', 'bare.md'), '---\ntype: concept\n---\n# Bare');
    setStatus(dir, '01-Concepts/bare.md', 'documented', loadConfig(dir, []), { dryRun: false, runId: 'RUN2' });
    expect(readFileSync(join(dir, '01-Concepts', 'bare.md'), 'utf8')).toContain('status: "documented"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- set-status`
Expected: FAIL — cannot find module `../src/atomize/set-status.js`.

- [ ] **Step 3: Implement `set-status.ts`**

```ts
// toolkit/src/atomize/set-status.ts
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { backupNote } from './backup.js';
import type { CortexConfig } from '../types.js';

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function patchStatus(content: string, field: string, value: string): string {
  const m = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!m) return `---\n${field}: "${value}"\n---\n\n${content}`;
  const line = new RegExp(`^${field}:.*$`, 'm');
  const newBody = line.test(m[2]) ? m[2].replace(line, `${field}: "${value}"`) : `${m[2]}\n${field}: "${value}"`;
  return content.replace(m[0], `${m[1]}${newBody}${m[3]}`);
}

export function setStatus(
  vaultDir: string,
  notePath: string,
  newStatus: string,
  config: CortexConfig,
  opts: { dryRun?: boolean; runId?: string } = {},
): { changed: string | null; backup: string | null; skipped?: { target: string; reason: string } } {
  const dryRun = opts.dryRun ?? true;
  const runId = opts.runId ?? makeRunId();
  const abs = resolve(vaultDir, notePath);
  const vaultAbs = resolve(vaultDir);
  if (abs !== vaultAbs && !abs.startsWith(vaultAbs + sep)) return { changed: null, backup: null, skipped: { target: notePath, reason: 'outside-vault' } };
  if (!existsSync(abs)) return { changed: null, backup: null, skipped: { target: notePath, reason: 'not-found' } };
  const realTarget = realpathSync(abs);
  const sourcesAbs = resolve(vaultDir, config.sourcesDir.replace(/\/$/, ''));
  const realSources = existsSync(sourcesAbs) ? realpathSync(sourcesAbs) : sourcesAbs;
  if (realTarget === realSources || realTarget.startsWith(realSources + sep)) return { changed: null, backup: null, skipped: { target: notePath, reason: 'source-immutable' } };

  const patched = patchStatus(readFileSync(abs, 'utf8'), config.fields.status, newStatus);
  if (dryRun) return { changed: null, backup: null };
  const backup = backupNote(vaultDir, notePath, runId);
  writeFileSync(abs, patched);
  return { changed: notePath, backup };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- set-status`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/set-status.ts toolkit/test/set-status.test.ts
git commit -m "feat(toolkit): set-status — reversible note status advance"
```

---

### Task 2: generalize undo — `recordPromotions` + `undoLatestRun`

**Files:**
- Modify: `toolkit/src/atomize/backup.ts`
- Modify: `toolkit/test/backup.test.ts`

**Interfaces:**
- Consumes: existing `backupNote`/`restoreLatestBackup` (same file).
- Produces:
  - `recordPromotions(vaultDir: string, moves: { from: string; to: string }[], runId: string): string` — writes `.cortex/promotions/<runId>.json` = `{ "moves": [...] }`; returns the journal's vault-relative path.
  - `undoLatestRun(vaultDir: string): { restored: string[]; reverted: string[] }` — finds the lexicographically-greatest `runId` across `.cortex/backups/` (dirs) and `.cortex/promotions/` (`*.json`). If the latest is a promotion journal → reverse each move (`to` → `from`, then remove `to`) → `reverted`. Else → `restoreLatestBackup` → `restored`. Empty → both `[]`.

- [ ] **Step 1: Write the failing test**

Add to `toolkit/test/backup.test.ts` (it already imports from `node:fs` and `node:path`; add `rmSync` if needed):

```ts
import { recordPromotions, undoLatestRun } from '../src/atomize/backup.js';

describe('undoLatestRun', () => {
  it('reverses the latest run whether it was an edit-backup or a promotion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-undo-'));
    mkdirSync(join(dir, '01-Concepts'));
    mkdirSync(join(dir, '_inbox', '01-Concepts'), { recursive: true });

    // an earlier edit-backup run
    writeFileSync(join(dir, '01-Concepts', 'edited.md'), 'EDITED');
    backupNote(dir, '01-Concepts/edited.md', '2026-01-01T00-00-00'); // backs up 'EDITED'
    writeFileSync(join(dir, '01-Concepts', 'edited.md'), 'CHANGED-AGAIN');

    // a LATER promotion run: a note was moved _inbox → curated
    writeFileSync(join(dir, '01-Concepts', 'moved.md'), 'note body');       // already at the destination
    recordPromotions(dir, [{ from: '_inbox/01-Concepts/moved.md', to: '01-Concepts/moved.md' }], '2026-02-02T00-00-00');

    const r = undoLatestRun(dir); // latest run is the promotion
    expect(r.reverted).toEqual(['_inbox/01-Concepts/moved.md']);
    expect(existsSync(join(dir, '_inbox', '01-Concepts', 'moved.md'))).toBe(true);  // moved back
    expect(existsSync(join(dir, '01-Concepts', 'moved.md'))).toBe(false);           // removed from curated
    expect(readFileSync(join(dir, '_inbox', '01-Concepts', 'moved.md'), 'utf8')).toBe('note body');
    expect(r.restored).toEqual([]);

    // now the latest remaining run is the edit-backup
    const r2 = undoLatestRun(dir);
    expect(r2.restored).toEqual(['01-Concepts/edited.md']);
    expect(readFileSync(join(dir, '01-Concepts', 'edited.md'), 'utf8')).toBe('EDITED');
  });

  it('returns both empty when there is nothing to undo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-undo0-'));
    expect(undoLatestRun(dir)).toEqual({ restored: [], reverted: [] });
  });
});
```

> Note: after `undoLatestRun` reverses a promotion, it must delete that journal (so the next undo targets the prior run). The test's second `undoLatestRun` call relies on this.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- backup`
Expected: FAIL — `recordPromotions`/`undoLatestRun` not exported.

- [ ] **Step 3: Extend `backup.ts`**

Add `rmSync` to the `node:fs` import, add the constant + two functions (keep `backupNote`/`restoreLatestBackup`/`walk` unchanged):

```ts
// add rmSync to the existing node:fs import:
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';

const PROMOTIONS_ROOT = '.cortex/promotions';

export function recordPromotions(vaultDir: string, moves: { from: string; to: string }[], runId: string): string {
  const rel = `${PROMOTIONS_ROOT}/${runId}.json`;
  const abs = join(vaultDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify({ moves }, null, 2));
  return rel;
}

export function undoLatestRun(vaultDir: string): { restored: string[]; reverted: string[] } {
  const backupsRoot = join(vaultDir, '.cortex/backups');
  const promosRoot = join(vaultDir, PROMOTIONS_ROOT);
  const backupRuns = existsSync(backupsRoot)
    ? readdirSync(backupsRoot).filter(r => statSync(join(backupsRoot, r)).isDirectory()).map(id => ({ id, kind: 'backup' as const }))
    : [];
  const promoRuns = existsSync(promosRoot)
    ? readdirSync(promosRoot).filter(f => f.endsWith('.json')).map(f => ({ id: f.replace(/\.json$/, ''), kind: 'promo' as const }))
    : [];
  const all = [...backupRuns, ...promoRuns].sort((a, b) => a.id.localeCompare(b.id));
  if (all.length === 0) return { restored: [], reverted: [] };
  const latest = all[all.length - 1];
  if (latest.kind === 'backup') return { restored: restoreLatestBackup(vaultDir).restored, reverted: [] };

  const journalPath = join(promosRoot, `${latest.id}.json`);
  const { moves } = JSON.parse(readFileSync(journalPath, 'utf8')) as { moves: { from: string; to: string }[] };
  const reverted: string[] = [];
  for (const m of moves) {
    const toAbs = join(vaultDir, m.to);
    if (!existsSync(toAbs)) continue;
    const fromAbs = join(vaultDir, m.from);
    mkdirSync(dirname(fromAbs), { recursive: true });
    writeFileSync(fromAbs, readFileSync(toAbs));
    rmSync(toAbs);
    reverted.push(m.from);
  }
  rmSync(journalPath); // consume the journal so the next undo targets the prior run
  return { restored: [], reverted: reverted.sort() };
}
```

(`dirname` and `join` are already imported in `backup.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- backup`
Expected: PASS (existing backup tests + the 2 new undo tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/backup.ts toolkit/test/backup.test.ts
git commit -m "feat(toolkit): generalized undo — reverse edits or promotions (latest run)"
```

---

### Task 3: `promote` — graduate ready drafts

**Files:**
- Create: `toolkit/src/atomize/promote.ts`
- Test: `toolkit/test/promote.test.ts`

**Interfaces:**
- Consumes: `scanVault` (vault.js), `recordPromotions` (backup.js), `CortexConfig` (types.js).
- Produces:
  - `planPromote(vaultDir: string, config: CortexConfig): { items: PromoteItem[] }` where `PromoteItem = { from: string; to: string; action: 'promote' | 'skip'; reason?: string }`.
  - `applyPromote(vaultDir: string, plan: { items: PromoteItem[] }, config: CortexConfig, opts?: { dryRun?: boolean; runId?: string }): { promoted: { from: string; to: string }[]; skipped: { from: string; reason: string }[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/promote.test.ts
import { describe, it, expect } from 'vitest';
import { planPromote, applyPromote } from '../src/atomize/promote.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-prom-'));
  mkdirSync(join(dir, '03-Rules'));
  mkdirSync(join(dir, '_inbox', '03-Rules'), { recursive: true });
  // ready (status advanced beyond draft)
  writeFileSync(join(dir, '_inbox', '03-Rules', 'ready.md'), '---\ntype: rule\nstatus: "documented"\n---\n# Ready\n\nbody');
  // still a draft → not eligible
  writeFileSync(join(dir, '_inbox', '03-Rules', 'draft.md'), '---\ntype: rule\nstatus: "draft"\n---\n# Draft\n\nbody');
  // ready but the curated destination already exists → skip 'exists'
  writeFileSync(join(dir, '_inbox', '03-Rules', 'dup.md'), '---\ntype: rule\nstatus: "documented"\n---\n# Dup\n\nbody');
  writeFileSync(join(dir, '03-Rules', 'dup.md'), '---\ntype: rule\n---\n# Dup (existing)');
  return dir;
}

describe('planPromote', () => {
  it('marks ready notes promote and others skip with reasons', () => {
    const dir = vault();
    const { items } = planPromote(dir, loadConfig(dir, []));
    const byFrom = Object.fromEntries(items.map(i => [i.from, i]));
    expect(byFrom['_inbox/03-Rules/ready.md']).toEqual({ from: '_inbox/03-Rules/ready.md', to: '03-Rules/ready.md', action: 'promote' });
    expect(byFrom['_inbox/03-Rules/draft.md'].reason).toBe('still-draft');
    expect(byFrom['_inbox/03-Rules/dup.md'].reason).toBe('exists');
  });
});

describe('applyPromote', () => {
  it('dry-runs by default: moves nothing', () => {
    const dir = vault();
    const r = applyPromote(dir, planPromote(dir, loadConfig(dir, [])), loadConfig(dir, []), { dryRun: true });
    expect(r.promoted).toEqual([]);
    expect(existsSync(join(dir, '03-Rules', 'ready.md'))).toBe(false);
    expect(existsSync(join(dir, '_inbox', '03-Rules', 'ready.md'))).toBe(true);
  });

  it('with --write: moves ready note to its curated folder and records the journal', () => {
    const dir = vault();
    const r = applyPromote(dir, planPromote(dir, loadConfig(dir, [])), loadConfig(dir, []), { dryRun: false, runId: 'RUN1' });
    expect(r.promoted).toEqual([{ from: '_inbox/03-Rules/ready.md', to: '03-Rules/ready.md' }]);
    expect(readFileSync(join(dir, '03-Rules', 'ready.md'), 'utf8')).toContain('# Ready');
    expect(existsSync(join(dir, '_inbox', '03-Rules', 'ready.md'))).toBe(false); // moved, not copied
    expect(existsSync(join(dir, '.cortex/promotions/RUN1.json'))).toBe(true);     // journal written
    // idempotent: re-plan now finds nothing to promote
    expect(planPromote(dir, loadConfig(dir, [])).items.some(i => i.action === 'promote')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- promote`
Expected: FAIL — cannot find module `../src/atomize/promote.js`.

- [ ] **Step 3: Implement `promote.ts`**

```ts
// toolkit/src/atomize/promote.ts
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { scanVault } from '../vault.js';
import { recordPromotions } from './backup.js';
import type { CortexConfig } from '../types.js';

const INBOX = '_inbox';

export interface PromoteItem { from: string; to: string; action: 'promote' | 'skip'; reason?: string }

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function planPromote(vaultDir: string, config: CortexConfig): { items: PromoteItem[] } {
  const draft = config.statusLifecycle[0] ?? 'draft';
  const items: PromoteItem[] = scanVault(vaultDir, config)
    .filter(n => n.folder === INBOX)
    .map(n => {
      if (!n.status || n.status === draft) return { from: n.path, to: '', action: 'skip', reason: 'still-draft' };
      const rest = n.path.slice(`${INBOX}/`.length);
      if (!rest.includes('/')) return { from: n.path, to: '', action: 'skip', reason: 'no-target-folder' };
      if (existsSync(join(vaultDir, rest))) return { from: n.path, to: rest, action: 'skip', reason: 'exists' };
      return { from: n.path, to: rest, action: 'promote' };
    });
  return { items };
}

export function applyPromote(
  vaultDir: string,
  plan: { items: PromoteItem[] },
  config: CortexConfig,
  opts: { dryRun?: boolean; runId?: string } = {},
): { promoted: { from: string; to: string }[]; skipped: { from: string; reason: string }[] } {
  const dryRun = opts.dryRun ?? true;
  const runId = opts.runId ?? makeRunId();
  const vaultAbs = resolve(vaultDir);
  const sourcesAbs = resolve(vaultDir, config.sourcesDir.replace(/\/$/, ''));
  const promoted: { from: string; to: string }[] = [];
  const skipped: { from: string; reason: string }[] = [];
  const moves: { from: string; to: string }[] = [];

  for (const item of plan.items) {
    if (item.action !== 'promote') { skipped.push({ from: item.from, reason: item.reason ?? 'skip' }); continue; }
    const toAbs = resolve(vaultDir, item.to);
    if (toAbs === vaultAbs || !toAbs.startsWith(vaultAbs + sep)) { skipped.push({ from: item.from, reason: 'outside-vault' }); continue; }
    if (toAbs === sourcesAbs || toAbs.startsWith(sourcesAbs + sep)) { skipped.push({ from: item.from, reason: 'source-immutable' }); continue; }
    if (!dryRun) {
      const fromAbs = join(vaultDir, item.from);
      mkdirSync(dirname(toAbs), { recursive: true });
      writeFileSync(toAbs, readFileSync(fromAbs));
      rmSync(fromAbs);
      moves.push({ from: item.from, to: item.to });
      promoted.push({ from: item.from, to: item.to });
    }
  }
  if (!dryRun && moves.length) recordPromotions(vaultDir, moves, runId);
  return { promoted, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- promote`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/promote.ts toolkit/test/promote.test.ts
git commit -m "feat(toolkit): promote — graduate ready drafts out of _inbox (reversible)"
```

---

### Task 4: command + CLI (`promote`, `undo`, `set-status`)

**Files:**
- Create: `toolkit/src/commands/promote.ts`
- Modify: `toolkit/src/commands/atomize.ts` (repoint `runUndo`)
- Modify: `toolkit/src/cli.ts`
- Modify: `toolkit/test/atomize.test.ts`

**Interfaces:**
- Consumes: `planPromote`/`applyPromote` (promote.js), `setStatus` (set-status.js), `undoLatestRun` (backup.js), `loadConfig`, `collectFrontmatterKeys`.
- Produces (in `commands/promote.ts`):
  - `runPromote(vaultDir, opts: { write?: boolean }): { plan; promoted; skipped; dryRun: boolean }`.
  - `formatPromote(r): string`.
  - `runSetStatus(vaultDir, notePath, newStatus, opts: { write?: boolean }): ReturnType<typeof setStatus>`.

- [ ] **Step 1: Write the failing test**

Add to `toolkit/test/atomize.test.ts`:

```ts
import { runPromote, formatPromote, runSetStatus } from '../src/commands/promote.js';
import { runUndo } from '../src/commands/atomize.js';

describe('runSetStatus + runPromote + runUndo (3.3)', () => {
  it('advances status, promotes, and undoes the promotion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-prcmd-'));
    mkdirSync(join(dir, '01-Concepts'));
    mkdirSync(join(dir, '_inbox', '01-Concepts'), { recursive: true });
    const inbox = join(dir, '_inbox', '01-Concepts', 'n.md');
    writeFileSync(inbox, '---\ntype: concept\nid: n\nstatus: "draft"\n---\n# N\n\nbody');

    // not ready yet → promote skips it
    expect(runPromote(dir, { write: true }).promoted).toEqual([]);

    // advance status, then promote
    expect(runSetStatus(dir, '_inbox/01-Concepts/n.md', 'documented', { write: true }).changed).toBe('_inbox/01-Concepts/n.md');
    const r = runPromote(dir, { write: true });
    expect(r.promoted).toEqual([{ from: '_inbox/01-Concepts/n.md', to: '01-Concepts/n.md' }]);
    expect(existsSync(join(dir, '01-Concepts', 'n.md'))).toBe(true);
    expect(formatPromote(r)).toMatch(/→ 01-Concepts\/n\.md/);

    // undo the promotion → note returns to _inbox
    const u = runUndo(dir);
    expect(u.reverted).toEqual(['_inbox/01-Concepts/n.md']);
    expect(existsSync(inbox)).toBe(true);
    expect(existsSync(join(dir, '01-Concepts', 'n.md'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- atomize`
Expected: FAIL — `runPromote`/`runSetStatus` not exported; `runUndo` returns no `reverted`.

- [ ] **Step 3: Create `commands/promote.ts`**

```ts
// toolkit/src/commands/promote.ts
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { planPromote, applyPromote, type PromoteItem } from '../atomize/promote.js';
import { setStatus } from '../atomize/set-status.js';

export function runPromote(vaultDir: string, opts: { write?: boolean }): {
  plan: { items: PromoteItem[] };
  promoted: { from: string; to: string }[];
  skipped: { from: string; reason: string }[];
  dryRun: boolean;
} {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const plan = planPromote(vaultDir, config);
  const { promoted, skipped } = applyPromote(vaultDir, plan, config, { dryRun: !opts.write });
  return { plan, promoted, skipped, dryRun: !opts.write };
}

export function formatPromote(r: ReturnType<typeof runPromote>): string {
  const planned = r.plan.items.filter(i => i.action === 'promote').length;
  const skips = r.plan.items.filter(i => i.action === 'skip').length;
  const lines = [`Promote: ${planned} ready · ${skips} skip`];
  lines.push(r.dryRun ? '(dry-run — nothing moved; pass --write to apply)' : `promoted ${r.promoted.length} note(s)`);
  for (const i of r.plan.items) {
    lines.push(i.action === 'promote' ? `  • ${i.from} → ${i.to}` : `  • ${i.from}  [skip: ${i.reason}]`);
  }
  return lines.join('\n');
}

export function runSetStatus(vaultDir: string, notePath: string, newStatus: string, opts: { write?: boolean }) {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  return setStatus(vaultDir, notePath, newStatus, config, { dryRun: !opts.write });
}
```

- [ ] **Step 4: Repoint `runUndo` in `commands/atomize.ts`**

Change the import and the `runUndo` body (it currently calls `restoreLatestBackup`):

```ts
// replace the backup import line:
import { undoLatestRun } from '../atomize/backup.js';

// replace runUndo:
export function runUndo(vaultDir: string): { restored: string[]; reverted: string[] } {
  return undoLatestRun(vaultDir);
}
```

- [ ] **Step 5: Wire the CLI**

In `toolkit/src/cli.ts`, add the import:

```ts
import { runPromote, formatPromote, runSetStatus } from './commands/promote.js';
```

Update the `atomize` case's `--undo` branch to report both restored and reverted:

```ts
      if (undo) {
        const { restored, reverted } = runUndo(cwd);
        const n = restored.length + reverted.length;
        console.log(n ? `Undid latest run: ${restored.length} restored, ${reverted.length} reverted` : 'Nothing to undo.');
        return 0;
      }
```

Add three new cases before `default`:

```ts
    case 'promote': {
      const write = argv.includes('--write');
      console.log(formatPromote(runPromote(cwd, { write })));
      return 0;
    }
    case 'undo': {
      const { restored, reverted } = runUndo(cwd);
      const n = restored.length + reverted.length;
      console.log(n ? `Undid latest run: ${restored.length} restored, ${reverted.length} reverted` : 'Nothing to undo.');
      return 0;
    }
    case 'set-status': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const [notePath, newStatus] = rest.filter(a => !a.startsWith('--'));
      if (!notePath || !newStatus) { console.log('Usage: cortex set-status <note.md> <status> [--write]'); return 1; }
      const r = runSetStatus(cwd, notePath, newStatus, { write });
      console.log(r.changed ? `${r.changed} → status: ${newStatus}` : r.skipped ? `skipped (${r.skipped.reason})` : '(dry-run — pass --write to apply)');
      return 0;
    }
```

Update the `default` usage string:

```ts
      console.log('Usage: cortex <init|status|orphans|viz|query|atomize|promote|undo|set-status>');
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd toolkit && npm test -- atomize`
Expected: PASS (existing atomize tests + the new 3.3 test).

- [ ] **Step 7: Full suite + build + temp-vault smoke**

Run: `cd toolkit && npm test` (all green), then `npm run build`.
Then a throwaway smoke (do NOT touch the repo tree):

```bash
D=$(mktemp -d); mkdir -p "$D/_inbox/03-Rules" "$D/03-Rules"
printf -- '---\ntype: rule\nid: limit\nstatus: "draft"\n---\n# Operation limit\n\nThe limit is 5.\n' > "$D/_inbox/03-Rules/limit.md"
CLI="/Users/wagnersebastian/Documents/0. WSDC Tech/4. N1X/n1x-cortex/toolkit/dist/cli.js"
(cd "$D" && node "$CLI" promote)                 # dry-run: limit.md is still draft → skip 'still-draft'
(cd "$D" && node "$CLI" set-status "_inbox/03-Rules/limit.md" documented --write)
(cd "$D" && node "$CLI" promote)                 # dry-run now shows it ready (→ 03-Rules/limit.md), moves nothing
test -f "$D/_inbox/03-Rules/limit.md" && echo "OK dry-run did not move"
(cd "$D" && node "$CLI" promote --write)         # graduates it
test -f "$D/03-Rules/limit.md" && ! test -f "$D/_inbox/03-Rules/limit.md" && echo "OK promoted to curated folder"
(cd "$D" && node "$CLI" undo)                     # reverses the promotion
test -f "$D/_inbox/03-Rules/limit.md" && ! test -f "$D/03-Rules/limit.md" && echo "OK undo returned it to _inbox"
```
Expected: `set-status` advances; `promote` dry-run moves nothing then `--write` graduates to the curated folder; `undo` returns it to `_inbox/`.

- [ ] **Step 8: Commit**

```bash
git add toolkit/src/commands/promote.ts toolkit/src/commands/atomize.ts toolkit/src/cli.ts toolkit/test/atomize.test.ts
git commit -m "feat(toolkit): cortex promote / undo / set-status commands"
```

---

### Task 5: the `/atomize` skill loop-close + docs

**Files:**
- Modify: `toolkit/skills/atomize/SKILL.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes (at runtime): `cortex set-status <note> <status> --write`, `cortex promote [--write]`, `cortex undo`.
- Produces: prose only. Verification = structural grep + manual smoke (Task 4's smoke exercises the CLI).

- [ ] **Step 1: Extend the skill with the loop-close steps**

In `toolkit/skills/atomize/SKILL.md`, after the existing apply/reversibility steps (the ones that run `--apply --write` and mention `--undo`), add a graduation step:

```markdown
7. **Graduate ready notes (optional, autonomous).** For each note you created or updated that you judge **complete and correct**, advance its status and promote it into the curated graph:
   - `node <cli> set-status "<_inbox path>" documented --write` — your confidence is the trust signal; leave notes you are unsure about as `draft` in `_inbox/`.
   - then `node <cli> promote --write` — graduates every note whose status is now beyond `draft` into its curated folder (`_inbox/03-Rules/x.md` → `03-Rules/x.md`). It never overwrites an existing curated note.
   - Report what was promoted. The whole run is reversible: `node <cli> undo` reverses the most recent action (a promotion returns the note to `_inbox/`; an edit or status change is rolled back).
```

Keep the prior rules intact (the draft barrier: notes are still CREATED as `draft`; the anti-illustrative-wikilink rule; the conservative-merge rule).

- [ ] **Step 2: Verify the skill structurally**

Run:
```bash
cd toolkit
grep -c -- 'set-status' skills/atomize/SKILL.md   # >= 1
grep -c -- 'promote --write' skills/atomize/SKILL.md  # >= 1
grep -c -- 'undo' skills/atomize/SKILL.md          # >= 1
head -4 skills/atomize/SKILL.md                    # frontmatter name: atomize intact
```
Expected: each grep ≥ 1; frontmatter present.

- [ ] **Step 3: Update README**

In `README.md`, `What it does today` table — add a **Promote** row after the Undo row:

```markdown
| **Promote** | `promote` | graduates ready drafts (status advanced beyond `draft`) out of `_inbox/` into their curated folder — never overwriting existing notes, fully reversible with `undo` |
```

In the engine section, after the `--undo` CLI line, add:

```bash
node /path/to/toolkit/dist/cli.js set-status "<note>" documented --write   # mark a draft ready (reversible)
node /path/to/toolkit/dist/cli.js promote --write                          # graduate ready drafts _inbox/ → curated folders
node /path/to/toolkit/dist/cli.js undo                                     # reverse the most recent run (edit / status / promotion)
```

Bump the roadmap line to include `Phase 3.3 (autonomous promote) ✓`.

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, extend the `toolkit/` inventory row to note the promote/set-status/undo surface and bump to Phases 0–3.3:

```markdown
| `toolkit/` | **The Cortex engine + agent** (Node/TS): reads any markdown vault into a note graph; CLI `init`/`status`/`orphans`/`viz`/`query`/`atomize`/`promote`/`set-status`/`undo`. `atomize` is **dry-run by default**: it creates `status: draft` notes in `_inbox/`, merges AI-distilled updates into existing notes in place (3.2), and (3.3) `promote` graduates status-advanced drafts out of `_inbox/` into curated folders. Every write is reversible (`.cortex/backups/` + `.cortex/promotions/`, `cortex undo`); `Markdown/` sources are never modified. AI distillation runs through `toolkit/skills/atomize/` (the `/atomize` skill). Phases 0–3.3. |
```

Also bump the "What was done here" blurb from "Phases 0–3.2" to "Phases 0–3.3: … autonomous update/merge, status-gated promote".

- [ ] **Step 5: Commit**

```bash
git add toolkit/skills/atomize/SKILL.md README.md CLAUDE.md
git commit -m "feat(toolkit): /atomize loop-close (promote) + document 3.3"
```

---

## Self-Review

**Spec coverage (design §1–§9):**
- `set-status` (reversible status patch, realpath-gated): Task 1. ✓
- generalized undo (recordPromotions + undoLatestRun, dispatch edits vs promotions): Task 2. ✓
- `promote` (status>draft gate, subfolder requirement, skip exists/still-draft/no-target-folder, move + journal, dry-run, idempotent): Task 3. ✓
- CLI `promote`/`undo`/`set-status` + `atomize --undo` alias + reuse: Task 4. ✓
- skill loop-close (set-status → promote → undo; draft barrier intact): Task 5. ✓
- Safety (sources immutable realpath, in-vault, never clobber, reversible): Tasks 1/3 (gates) + Task 2 (undo), asserted. ✓
- Docs (README + CLAUDE): Task 5. ✓
- Scope-out (multi-source, tag-union, 3-way merge, undo-specific-run, route-in-place, 3.2 minors): not implemented — correct. ✓

**Placeholder scan:** no TBD/TODO; every code step shows complete code; the skill prose is fully written.

**Type consistency:** `PromoteItem` defined in Task 3, consumed by `runPromote`/`formatPromote` (Task 4). `setStatus` (Task 1) → `runSetStatus` (Task 4). `recordPromotions`/`undoLatestRun` (Task 2) → `applyPromote` (Task 3) / `runUndo` (Task 4). `runUndo` return widened to `{restored, reverted}` (Task 2/4); CLI consumes both. The journal shape `{ moves: [{from,to}] }` is written by `recordPromotions` and read by `undoLatestRun` (Task 2).

## Notes for execution

- **Reversibility is the review focus.** Confirm: dry-run changes nothing and takes no backup/journal; `set-status` patches only the status line (rest verbatim); `promote` moves (not copies) and never clobbers/escapes/touches `Markdown/`; `undoLatestRun` reverses the correct latest run and consumes its journal; idempotent re-promote.
- **`undoLatestRun` dispatch** depends on `runId` timestamps sorting lexicographically across the two stores — keep the `makeRunId` format (`toISOString().replace(/[:.]/g,'-')`) identical in `set-status.ts` and `promote.ts`.
- **Draft barrier stays intact** — nothing in 3.3 makes creation produce non-draft notes; only `set-status` advances, as a deliberate reversible act.
- **Phase 3.4 follow-ups (out of scope, log them):** multi-source frontmatter; tag-union on update; structured 3-way merge; `undo` of a specific (not just latest) run; route-in-place; auto-advancing status via a dedicated Curate agent; the 3.2 hardening minors.
```
