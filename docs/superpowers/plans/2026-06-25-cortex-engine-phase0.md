# Cortex Engine (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only Cortex engine and CLI that parses any markdown vault into a note graph and reports its structure (`init`, `status`, `orphans`) — without writing to the vault.

**Architecture:** A small TypeScript library (`toolkit/`) that reads a vault's `.md` files, parses frontmatter + wikilinks into a schema-agnostic `Note` model, builds an in-memory graph (including dangling/orphan targets), and exposes three read-only CLI commands. The `.md` files are the only source of truth; the engine never writes to them in this phase.

**Tech Stack:** Node ≥ 20, TypeScript (ESM), vitest (tests), gray-matter (frontmatter parsing). No other runtime dependencies.

## Global Constraints

- **Runtime:** Node ≥ 20, TypeScript, ESM (`"type": "module"`).
- **Local & dependency-light:** no network calls; only runtime dependency is `gray-matter`.
- **`.md` is the only source of truth:** Phase 0 is **read-only** — no command writes into the vault.
- **Schema- and locale-agnostic:** never hardcode English field names; discover `type`/`status`/`id`/`source` fields and folder names from the vault, overridable by `.cortex.json`.
- **Tool language is English:** code, command names, and output strings are English.
- **Package root:** all code lives under `toolkit/` in the n1x-cortex repo.
- **Tests:** every task is test-first (TDD); run with `npm test` (vitest).

---

## File Structure

```
toolkit/
├── package.json            — package manifest, scripts, deps
├── tsconfig.json           — TypeScript config (ESM, strict)
├── vitest.config.ts        — test runner config
├── src/
│   ├── types.ts            — shared types: Note, NoteLink, CortexConfig, Graph
│   ├── frontmatter.ts      — parseFrontmatter(content) → { data, body }
│   ├── wikilinks.ts        — extractLinks(body) → NoteLink[]
│   ├── note.ts             — buildNote(relPath, content, config) → Note
│   ├── config.ts           — loadConfig(vaultDir) → CortexConfig (infer + defaults)
│   ├── vault.ts            — scanVault(config) → Note[]
│   ├── graph.ts            — buildGraph(notes) → Graph
│   ├── cli.ts              — argv dispatch → commands
│   └── commands/
│       ├── init.ts         — `cortex init`
│       ├── status.ts       — `cortex status`
│       └── orphans.ts      — `cortex orphans`
└── test/
    ├── frontmatter.test.ts
    ├── wikilinks.test.ts
    ├── note.test.ts
    ├── config.test.ts
    ├── vault.test.ts
    ├── graph.test.ts
    └── commands.test.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: `toolkit/package.json`
- Create: `toolkit/tsconfig.json`
- Create: `toolkit/vitest.config.ts`
- Create: `toolkit/src/types.ts`
- Test: `toolkit/test/smoke.test.ts`

**Interfaces:**
- Produces: the shared types every later task imports —
  `NoteLink { target: string; heading: string | null }`,
  `Note { path; id; title; type; status; tags; meta; folder; links; source; body }`,
  `CortexConfig { vaultRoot; sourcesDir; lang; fields; statusLifecycle; immutableStatus; autonomy; viz }`,
  `Graph { nodes: Map<string, GraphNode>; edges: GraphEdge[]; orphans: string[] }`.

- [ ] **Step 1: Write the failing smoke test**

```ts
// toolkit/test/smoke.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_LIFECYCLE } from '../src/types.js';

describe('scaffold', () => {
  it('exposes the default status lifecycle', () => {
    expect(DEFAULT_LIFECYCLE).toEqual(['draft', 'documented', 'verified']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npm install && npm test`
Expected: FAIL — cannot find module `../src/types.js` (file doesn't exist yet).

- [ ] **Step 3: Create the manifest and config files**

```json
// toolkit/package.json
{
  "name": "@n1x/cortex",
  "version": "0.0.0",
  "type": "module",
  "bin": { "cortex": "./dist/cli.js" },
  "scripts": {
    "test": "vitest run",
    "build": "tsc",
    "cli": "tsx src/cli.ts"
  },
  "dependencies": { "gray-matter": "^4.0.3" },
  "devDependencies": { "typescript": "^5.4.0", "vitest": "^1.6.0", "tsx": "^4.7.0", "@types/node": "^20.0.0" }
}
```

```json
// toolkit/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

```ts
// toolkit/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 4: Create the shared types**

```ts
// toolkit/src/types.ts
export const DEFAULT_LIFECYCLE = ['draft', 'documented', 'verified'] as const;

export interface NoteLink {
  target: string;          // the raw [[target]] text (without brackets, before any | alias)
  heading: string | null;  // the nearest heading above the link, or null
}

export interface Note {
  path: string;                       // vault-relative path, e.g. "01-Conceptos/foo.md"
  id: string;                         // frontmatter id, else filename without extension
  title: string;                      // first H1, else filename without extension
  type: string | null;
  status: string | null;
  tags: string[];
  meta: Record<string, unknown>;      // all frontmatter keys not mapped above
  folder: string;                     // top-level folder, e.g. "01-Conceptos"
  links: NoteLink[];
  source: string | null;
  body: string;
}

export interface CortexFields { type: string; status: string; id: string; source: string; }

export interface CortexConfig {
  vaultRoot: string;
  sourcesDir: string;
  lang: string | null;
  fields: CortexFields;
  statusLifecycle: string[];
  immutableStatus: string | null;
  autonomy: 'off' | 'suggest' | 'auto-draft' | 'full';
  viz: { port: number };
}

export interface GraphNode { key: string; note: Note | null; exists: boolean; }
export interface GraphEdge { from: string; to: string; heading: string | null; }
export interface Graph {
  nodes: Map<string, GraphNode>;  // keyed by resolution key (id / title / basename)
  edges: GraphEdge[];
  orphans: string[];              // link targets with no matching note
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd toolkit && npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add toolkit/package.json toolkit/tsconfig.json toolkit/vitest.config.ts toolkit/src/types.ts toolkit/test/smoke.test.ts
git commit -m "chore(toolkit): scaffold Cortex engine package with shared types"
```

---

### Task 2: Frontmatter parsing

**Files:**
- Create: `toolkit/src/frontmatter.ts`
- Test: `toolkit/test/frontmatter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseFrontmatter(content: string): { data: Record<string, unknown>; body: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/frontmatter.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../src/frontmatter.js';

describe('parseFrontmatter', () => {
  it('splits YAML frontmatter from the body', () => {
    const md = '---\ntipo: regla\nestado: documentado\n---\n# Title\n\nBody text.';
    const { data, body } = parseFrontmatter(md);
    expect(data.tipo).toBe('regla');
    expect(data.estado).toBe('documentado');
    expect(body.trim()).toBe('# Title\n\nBody text.');
  });

  it('returns empty data when there is no frontmatter', () => {
    const { data, body } = parseFrontmatter('# Just a title');
    expect(data).toEqual({});
    expect(body.trim()).toBe('# Just a title');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- frontmatter`
Expected: FAIL — cannot find module `../src/frontmatter.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/frontmatter.ts
import matter from 'gray-matter';

export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const parsed = matter(content);
  return { data: parsed.data as Record<string, unknown>, body: parsed.content };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- frontmatter`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/frontmatter.ts toolkit/test/frontmatter.test.ts
git commit -m "feat(toolkit): parse YAML frontmatter from notes"
```

---

### Task 3: Wikilink + heading extraction

**Files:**
- Create: `toolkit/src/wikilinks.ts`
- Test: `toolkit/test/wikilinks.test.ts`

**Interfaces:**
- Consumes: `NoteLink` from `types.ts`.
- Produces: `extractLinks(body: string): NoteLink[]` — each `[[target]]` (alias and anchors stripped), tagged with the nearest heading above it.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/wikilinks.test.ts
import { describe, it, expect } from 'vitest';
import { extractLinks } from '../src/wikilinks.js';

describe('extractLinks', () => {
  it('extracts targets and strips alias/anchor', () => {
    const body = 'See [[FLOW-Login]] and [[RULE-01|the rule]] and [[Note#section]].';
    expect(extractLinks(body).map(l => l.target)).toEqual(['FLOW-Login', 'RULE-01', 'Note']);
  });

  it('attaches the nearest heading above each link', () => {
    const body = '# Top\n\n[[A]]\n\n## Relacionadas\n\n[[B]] [[C]]';
    const links = extractLinks(body);
    expect(links.find(l => l.target === 'A')?.heading).toBe('Top');
    expect(links.find(l => l.target === 'B')?.heading).toBe('Relacionadas');
    expect(links.find(l => l.target === 'C')?.heading).toBe('Relacionadas');
  });

  it('returns an empty array when there are no links', () => {
    expect(extractLinks('plain text, no links')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- wikilinks`
Expected: FAIL — cannot find module `../src/wikilinks.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/wikilinks.ts
import type { NoteLink } from './types.js';

const LINK_RE = /\[\[([^\]]+)\]\]/g;
const HEADING_RE = /^#{1,6}\s+(.+?)\s*$/;

export function extractLinks(body: string): NoteLink[] {
  const links: NoteLink[] = [];
  let currentHeading: string | null = null;

  for (const line of body.split('\n')) {
    const h = line.match(HEADING_RE);
    if (h) { currentHeading = h[1]; continue; }

    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(line)) !== null) {
      const raw = m[1].split('|')[0].split('#')[0].trim();
      if (raw) links.push({ target: raw, heading: currentHeading });
    }
  }
  return links;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- wikilinks`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/wikilinks.ts toolkit/test/wikilinks.test.ts
git commit -m "feat(toolkit): extract wikilinks with heading context"
```

---

### Task 4: Note model

**Files:**
- Create: `toolkit/src/note.ts`
- Test: `toolkit/test/note.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter` (Task 2), `extractLinks` (Task 3), `Note`/`CortexFields` (Task 1).
- Produces: `buildNote(relPath: string, content: string, fields: CortexFields): Note`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/note.test.ts
import { describe, it, expect } from 'vitest';
import { buildNote } from '../src/note.js';
import type { CortexFields } from '../src/types.js';

const FIELDS: CortexFields = { type: 'tipo', status: 'estado', id: 'id', source: 'fuente' };

describe('buildNote', () => {
  it('maps configured fields and keeps the rest in meta', () => {
    const md = [
      '---', 'tipo: regla', 'estado: documentado', 'id: RULE-01',
      'fuente: "[[FUENTE-x]]"', 'modulo: global', 'tags: [a, b]', '---',
      '# Rule One', '', 'Body [[RULE-02]].',
    ].join('\n');
    const note = buildNote('03-Reglamentos/rule-one.md', md, FIELDS);
    expect(note.type).toBe('regla');
    expect(note.status).toBe('documentado');
    expect(note.id).toBe('RULE-01');
    expect(note.source).toBe('[[FUENTE-x]]');
    expect(note.title).toBe('Rule One');
    expect(note.folder).toBe('03-Reglamentos');
    expect(note.tags).toEqual(['a', 'b']);
    expect(note.meta.modulo).toBe('global');
    expect(note.meta.tipo).toBeUndefined();        // mapped fields are not duplicated in meta
    expect(note.links.map(l => l.target)).toEqual(['RULE-02']);
  });

  it('falls back to filename for id/title when frontmatter is absent', () => {
    const note = buildNote('01-Conceptos/lonely.md', 'no frontmatter here', FIELDS);
    expect(note.id).toBe('lonely');
    expect(note.title).toBe('lonely');
    expect(note.type).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- note`
Expected: FAIL — cannot find module `../src/note.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/note.ts
import { parseFrontmatter } from './frontmatter.js';
import { extractLinks } from './wikilinks.js';
import type { Note, CortexFields } from './types.js';

function basename(relPath: string): string {
  const file = relPath.split('/').pop() ?? relPath;
  return file.replace(/\.md$/i, '');
}

function firstHeading(body: string): string | null {
  for (const line of body.split('\n')) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function buildNote(relPath: string, content: string, fields: CortexFields): Note {
  const { data, body } = parseFrontmatter(content);
  const file = basename(relPath);

  const tagsRaw = data.tags;
  const tags = Array.isArray(tagsRaw) ? tagsRaw.map(String) : [];

  const mapped = new Set([fields.type, fields.status, fields.id, fields.source, 'tags']);
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (!mapped.has(k)) meta[k] = v;

  const source = asString(data[fields.source])?.replace(/^\[\[|\]\]$/g, '') ?? null;

  return {
    path: relPath,
    id: asString(data[fields.id]) ?? file,
    title: firstHeading(body) ?? file,
    type: asString(data[fields.type]),
    status: asString(data[fields.status]),
    tags,
    meta,
    folder: relPath.includes('/') ? relPath.split('/')[0] : '',
    links: extractLinks(body),
    source,
    body,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- note`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/note.ts toolkit/test/note.test.ts
git commit -m "feat(toolkit): build schema-agnostic Note model from a file"
```

---

### Task 5: Config loading + field inference

**Files:**
- Create: `toolkit/src/config.ts`
- Test: `toolkit/test/config.test.ts`

**Interfaces:**
- Consumes: `CortexConfig`, `CortexFields`, `DEFAULT_LIFECYCLE` (Task 1).
- Produces:
  - `inferFields(frontmatterKeys: string[]): CortexFields` — pick field names from observed keys.
  - `loadConfig(vaultDir: string, sampleKeys?: string[]): CortexConfig` — read `.cortex.json` if present, else defaults + inference.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/config.test.ts
import { describe, it, expect } from 'vitest';
import { inferFields, loadConfig } from '../src/config.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('inferFields', () => {
  it('detects Spanish field names', () => {
    expect(inferFields(['tipo', 'estado', 'id', 'fuente', 'modulo']))
      .toEqual({ type: 'tipo', status: 'estado', id: 'id', source: 'fuente' });
  });
  it('detects English field names', () => {
    expect(inferFields(['type', 'status', 'id', 'source']))
      .toEqual({ type: 'type', status: 'status', id: 'id', source: 'source' });
  });
  it('falls back to English defaults when nothing matches', () => {
    expect(inferFields(['foo', 'bar']))
      .toEqual({ type: 'type', status: 'status', id: 'id', source: 'source' });
  });
});

describe('loadConfig', () => {
  it('uses defaults + inference when no .cortex.json exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-'));
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    expect(cfg.fields.type).toBe('tipo');
    expect(cfg.statusLifecycle).toEqual(['draft', 'documented', 'verified']);
    expect(cfg.autonomy).toBe('auto-draft');
  });
  it('lets .cortex.json override defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-'));
    writeFileSync(join(dir, '.cortex.json'), JSON.stringify({ lang: 'es', autonomy: 'off' }));
    const cfg = loadConfig(dir, ['type']);
    expect(cfg.lang).toBe('es');
    expect(cfg.autonomy).toBe('off');
    expect(cfg.fields.type).toBe('type'); // still inferred where not overridden
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- config`
Expected: FAIL — cannot find module `../src/config.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/config.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LIFECYCLE } from './types.js';
import type { CortexConfig, CortexFields } from './types.js';

const CANDIDATES = {
  type: ['type', 'tipo', 'tipo_nota'],
  status: ['status', 'estado'],
  id: ['id', 'uid'],
  source: ['source', 'fuente', 'origen'],
};

export function inferFields(keys: string[]): CortexFields {
  const pick = (opts: string[], fallback: string) => opts.find(o => keys.includes(o)) ?? fallback;
  return {
    type: pick(CANDIDATES.type, 'type'),
    status: pick(CANDIDATES.status, 'status'),
    id: pick(CANDIDATES.id, 'id'),
    source: pick(CANDIDATES.source, 'source'),
  };
}

export function loadConfig(vaultDir: string, sampleKeys: string[] = []): CortexConfig {
  const fields = inferFields(sampleKeys);
  const defaults: CortexConfig = {
    vaultRoot: '.',
    sourcesDir: 'Markdown',
    lang: null,
    fields,
    statusLifecycle: [...DEFAULT_LIFECYCLE],
    immutableStatus: null,
    autonomy: 'auto-draft',
    viz: { port: 4317 },
  };

  const file = join(vaultDir, '.cortex.json');
  if (!existsSync(file)) return defaults;

  const override = JSON.parse(readFileSync(file, 'utf8')) as Partial<CortexConfig>;
  return {
    ...defaults,
    ...override,
    fields: { ...defaults.fields, ...(override.fields ?? {}) },
    viz: { ...defaults.viz, ...(override.viz ?? {}) },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- config`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/config.ts toolkit/test/config.test.ts
git commit -m "feat(toolkit): load .cortex.json with field inference and defaults"
```

---

### Task 6: Vault scan

**Files:**
- Create: `toolkit/src/vault.ts`
- Test: `toolkit/test/vault.test.ts`

**Interfaces:**
- Consumes: `buildNote` (Task 4), `CortexConfig` (Task 1).
- Produces:
  - `collectFrontmatterKeys(vaultDir: string): string[]` — distinct frontmatter keys across the vault (for inference).
  - `scanVault(vaultDir: string, config: CortexConfig): Note[]` — every `.md` under vaultRoot, excluding the sources dir.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/vault.test.ts
import { describe, it, expect } from 'vitest';
import { scanVault, collectFrontmatterKeys } from '../src/vault.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-vault-'));
  mkdirSync(join(dir, '01-Conceptos'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, '01-Conceptos', 'a.md'), '---\ntipo: concepto\n---\n# A\n[[B]]');
  writeFileSync(join(dir, 'Markdown', 'source.md'), '# Raw source (excluded)');
  return dir;
}

describe('vault', () => {
  it('collects distinct frontmatter keys', () => {
    expect(collectFrontmatterKeys(fixture())).toContain('tipo');
  });
  it('scans notes and excludes the sources dir', () => {
    const dir = fixture();
    const cfg = loadConfig(dir, ['tipo']);
    const notes = scanVault(dir, cfg);
    expect(notes.map(n => n.path)).toEqual(['01-Conceptos/a.md']);
    expect(notes[0].type).toBe('concepto');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- vault`
Expected: FAIL — cannot find module `../src/vault.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/vault.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { buildNote } from './note.js';
import type { Note, CortexConfig } from './types.js';

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.toLowerCase().endsWith('.md')) acc.push(full);
  }
  return acc;
}

function relPosix(root: string, full: string): string {
  return relative(root, full).split(sep).join('/');
}

export function collectFrontmatterKeys(vaultDir: string): string[] {
  const keys = new Set<string>();
  for (const full of walk(vaultDir)) {
    const { data } = parseFrontmatter(readFileSync(full, 'utf8'));
    for (const k of Object.keys(data)) keys.add(k);
  }
  return [...keys];
}

export function scanVault(vaultDir: string, config: CortexConfig): Note[] {
  const sources = config.sourcesDir.replace(/\/$/, '');
  const notes: Note[] = [];
  for (const full of walk(vaultDir)) {
    const rel = relPosix(vaultDir, full);
    if (rel === `${sources}` || rel.startsWith(`${sources}/`)) continue;
    notes.push(buildNote(rel, readFileSync(full, 'utf8'), config.fields));
  }
  return notes.sort((a, b) => a.path.localeCompare(b.path));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- vault`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/vault.ts toolkit/test/vault.test.ts
git commit -m "feat(toolkit): scan a vault into notes, excluding sources dir"
```

---

### Task 7: Graph build (with orphans)

**Files:**
- Create: `toolkit/src/graph.ts`
- Test: `toolkit/test/graph.test.ts`

**Interfaces:**
- Consumes: `Note`, `Graph`, `GraphNode`, `GraphEdge` (Task 1).
- Produces: `buildGraph(notes: Note[]): Graph`. A link target resolves against any note's `id`, `title`, or filename basename; unresolved targets become `orphans` and a non-existing `GraphNode` (`exists: false`).

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/graph.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph.js';
import type { Note } from '../src/types.js';

function note(partial: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...partial };
}

describe('buildGraph', () => {
  it('resolves links and flags dangling targets as orphans', () => {
    const notes = [
      note({ path: 'a.md', id: 'A', title: 'Alpha', links: [{ target: 'B', heading: null }, { target: 'Ghost', heading: null }] }),
      note({ path: 'b.md', id: 'B', title: 'Beta', links: [] }),
    ];
    const g = buildGraph(notes);
    expect(g.edges).toContainEqual({ from: 'A', to: 'B', heading: null });
    expect(g.orphans).toEqual(['Ghost']);
    expect(g.nodes.get('Ghost')?.exists).toBe(false);
    expect(g.nodes.get('A')?.exists).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- graph`
Expected: FAIL — cannot find module `../src/graph.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/graph.ts
import type { Note, Graph, GraphNode, GraphEdge } from './types.js';

function basename(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

export function buildGraph(notes: Note[]): Graph {
  const nodes = new Map<string, GraphNode>();
  const resolve = new Map<string, string>(); // alias key -> canonical key (the note id)

  for (const n of notes) {
    const key = n.id;
    nodes.set(key, { key, note: n, exists: true });
    for (const alias of [n.id, n.title, basename(n.path)]) {
      if (alias) resolve.set(alias, key);
    }
  }

  const edges: GraphEdge[] = [];
  const orphans: string[] = [];

  for (const n of notes) {
    for (const link of n.links) {
      const canonical = resolve.get(link.target);
      if (canonical) {
        edges.push({ from: n.id, to: canonical, heading: link.heading });
      } else {
        if (!nodes.has(link.target)) nodes.set(link.target, { key: link.target, note: null, exists: false });
        if (!orphans.includes(link.target)) orphans.push(link.target);
        edges.push({ from: n.id, to: link.target, heading: link.heading });
      }
    }
  }

  return { nodes, edges, orphans };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- graph`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/graph.ts toolkit/test/graph.test.ts
git commit -m "feat(toolkit): build note graph with orphan detection"
```

---

### Task 8: CLI dispatch + `init` command

**Files:**
- Create: `toolkit/src/cli.ts`
- Create: `toolkit/src/commands/init.ts`
- Test: `toolkit/test/commands.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `collectFrontmatterKeys` (Tasks 5–6).
- Produces:
  - `runInit(vaultDir: string): { created: boolean; config: CortexConfig }` — writes `.cortex.json` with inferred conventions if it does not exist; never overwrites.
  - `main(argv: string[]): Promise<number>` in `cli.ts` — dispatches `init`/`status`/`orphans`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/commands.test.ts
import { describe, it, expect } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-cmd-'));
  mkdirSync(join(dir, '03-Reglamentos'));
  writeFileSync(join(dir, '03-Reglamentos', 'r.md'), '---\ntipo: regla\nestado: documentado\n---\n# R');
  return dir;
}

describe('runInit', () => {
  it('writes a .cortex.json with inferred fields', () => {
    const dir = vault();
    const { created, config } = runInit(dir);
    expect(created).toBe(true);
    expect(existsSync(join(dir, '.cortex.json'))).toBe(true);
    expect(config.fields.type).toBe('tipo');
    expect(config.fields.status).toBe('estado');
  });
  it('does not overwrite an existing config', () => {
    const dir = vault();
    runInit(dir);
    const { created } = runInit(dir);
    expect(created).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- commands`
Expected: FAIL — cannot find module `../src/commands/init.js`.

- [ ] **Step 3: Write the `init` command**

```ts
// toolkit/src/commands/init.ts
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import type { CortexConfig } from '../types.js';

export function runInit(vaultDir: string): { created: boolean; config: CortexConfig } {
  const keys = collectFrontmatterKeys(vaultDir);
  const config = loadConfig(vaultDir, keys);
  const file = join(vaultDir, '.cortex.json');
  if (existsSync(file)) return { created: false, config };
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return { created: true, config };
}
```

- [ ] **Step 4: Write the CLI dispatcher**

```ts
// toolkit/src/cli.ts
import { runInit } from './commands/init.js';

export async function main(argv: string[]): Promise<number> {
  const [cmd] = argv;
  const cwd = process.cwd();
  switch (cmd) {
    case 'init': {
      const { created, config } = runInit(cwd);
      console.log(created
        ? `Created .cortex.json (type=${config.fields.type}, status=${config.fields.status})`
        : '.cortex.json already exists — left unchanged');
      return 0;
    }
    default:
      console.log('Usage: cortex <init|status|orphans>');
      return cmd ? 1 : 0;
  }
}

main(process.argv.slice(2)).then(code => process.exit(code));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- commands`
Expected: PASS (2 tests).

- [ ] **Step 6: Smoke-test the CLI against the real vault (read-only safe)**

Run: `cd toolkit && npx tsx src/cli.ts init` from inside a copy of a real vault, or:
`cd "<a vault dir>" && npx tsx "<repo>/toolkit/src/cli.ts" init`
Expected: prints `Created .cortex.json (type=tipo, status=estado)` and writes the file.

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/cli.ts toolkit/src/commands/init.ts toolkit/test/commands.test.ts
git commit -m "feat(toolkit): add CLI dispatch and cortex init command"
```

---

### Task 9: `status` command

**Files:**
- Create: `toolkit/src/commands/status.ts`
- Modify: `toolkit/src/cli.ts` (add the `status` case)
- Test: `toolkit/test/commands.test.ts` (add a `runStatus` block)

**Interfaces:**
- Consumes: `loadConfig`, `collectFrontmatterKeys`, `scanVault` (Tasks 5–6), `buildGraph` (Task 7).
- Produces: `runStatus(vaultDir: string): { total: number; byType: Record<string, number>; byStatus: Record<string, number>; orphans: number }`.

- [ ] **Step 1: Write the failing test (append to commands.test.ts)**

```ts
// append to toolkit/test/commands.test.ts
import { runStatus } from '../src/commands/status.js';

describe('runStatus', () => {
  it('counts notes by type and status and reports orphans', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-st-'));
    mkdirSync(join(dir, '03-Reglamentos'));
    writeFileSync(join(dir, '03-Reglamentos', 'r1.md'), '---\ntipo: regla\nestado: documentado\n---\n# R1\n[[Ghost]]');
    writeFileSync(join(dir, '03-Reglamentos', 'r2.md'), '---\ntipo: regla\nestado: borrador\n---\n# R2');
    const s = runStatus(dir);
    expect(s.total).toBe(2);
    expect(s.byType.regla).toBe(2);
    expect(s.byStatus.documentado).toBe(1);
    expect(s.byStatus.borrador).toBe(1);
    expect(s.orphans).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- commands`
Expected: FAIL — cannot find module `../src/commands/status.js`.

- [ ] **Step 3: Write the `status` command**

```ts
// toolkit/src/commands/status.ts
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { buildGraph } from '../graph.js';

export function runStatus(vaultDir: string): {
  total: number; byType: Record<string, number>; byStatus: Record<string, number>; orphans: number;
} {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const n of notes) {
    if (n.type) byType[n.type] = (byType[n.type] ?? 0) + 1;
    if (n.status) byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
  }
  return { total: notes.length, byType, byStatus, orphans: buildGraph(notes).orphans.length };
}
```

- [ ] **Step 4: Wire it into the CLI (add the case before `default`)**

```ts
// in toolkit/src/cli.ts — add import at top:
import { runStatus } from './commands/status.js';

// add this case inside the switch:
    case 'status': {
      const s = runStatus(cwd);
      console.log(`Notes: ${s.total}  ·  Orphans: ${s.orphans}`);
      console.log('By type:   ' + Object.entries(s.byType).map(([k, v]) => `${k}=${v}`).join('  '));
      console.log('By status: ' + Object.entries(s.byStatus).map(([k, v]) => `${k}=${v}`).join('  '));
      return 0;
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- commands`
Expected: PASS (all command tests).

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/commands/status.ts toolkit/src/cli.ts toolkit/test/commands.test.ts
git commit -m "feat(toolkit): add cortex status dashboard command"
```

---

### Task 10: `orphans` command

**Files:**
- Create: `toolkit/src/commands/orphans.ts`
- Modify: `toolkit/src/cli.ts` (add the `orphans` case)
- Test: `toolkit/test/commands.test.ts` (add a `runOrphans` block)

**Interfaces:**
- Consumes: `loadConfig`, `collectFrontmatterKeys`, `scanVault`, `buildGraph`.
- Produces: `runOrphans(vaultDir: string): { target: string; refs: number }[]` — dangling targets ranked by inbound reference count (atomize-next priority).

- [ ] **Step 1: Write the failing test (append to commands.test.ts)**

```ts
// append to toolkit/test/commands.test.ts
import { runOrphans } from '../src/commands/orphans.js';

describe('runOrphans', () => {
  it('ranks dangling targets by inbound references', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-or-'));
    mkdirSync(join(dir, '01-Conceptos'));
    writeFileSync(join(dir, '01-Conceptos', 'a.md'), '---\ntipo: concepto\n---\n# A\n[[Hot]] [[Cold]]');
    writeFileSync(join(dir, '01-Conceptos', 'b.md'), '---\ntipo: concepto\n---\n# B\n[[Hot]]');
    const out = runOrphans(dir);
    expect(out[0]).toEqual({ target: 'Hot', refs: 2 });
    expect(out).toContainEqual({ target: 'Cold', refs: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- commands`
Expected: FAIL — cannot find module `../src/commands/orphans.js`.

- [ ] **Step 3: Write the `orphans` command**

```ts
// toolkit/src/commands/orphans.ts
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { buildGraph } from '../graph.js';

export function runOrphans(vaultDir: string): { target: string; refs: number }[] {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const graph = buildGraph(scanVault(vaultDir, config));
  const counts = new Map<string, number>();
  for (const t of graph.orphans) counts.set(t, 0);
  for (const e of graph.edges) {
    if (counts.has(e.to)) counts.set(e.to, (counts.get(e.to) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([target, refs]) => ({ target, refs }))
    .sort((a, b) => b.refs - a.refs || a.target.localeCompare(b.target));
}
```

- [ ] **Step 4: Wire it into the CLI (add the case before `default`)**

```ts
// in toolkit/src/cli.ts — add import at top:
import { runOrphans } from './commands/orphans.js';

// add this case inside the switch:
    case 'orphans': {
      const out = runOrphans(cwd);
      console.log(`Gaps (dangling targets, atomize-next priority): ${out.length}`);
      for (const { target, refs } of out.slice(0, 30)) console.log(`  ${String(refs).padStart(3)}  ${target}`);
      return 0;
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- commands`
Expected: PASS (all command tests).

- [ ] **Step 6: Full suite + real-vault smoke test**

Run: `cd toolkit && npm test`
Expected: PASS (all tests).
Then, from a real vault dir: `npx tsx "<repo>/toolkit/src/cli.ts" status` and `... orphans`
Expected: real counts (e.g. hundreds of notes, a ranked gap list).

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/commands/orphans.ts toolkit/src/cli.ts toolkit/test/commands.test.ts
git commit -m "feat(toolkit): add cortex orphans (atomize-next) command"
```

---

## Self-Review

**Spec coverage (Phase 0 rows of §10 + relevant §4–§7):**
- Engine: schema-agnostic parse of frontmatter (Task 2) + wikilinks (Task 3) → Note model (Task 4). ✓ (§5 note model)
- `.md` is truth, read-only: no task writes into notes; only `init` writes `.cortex.json` (config, not a note). ✓ (§4 principle 1)
- Schema/locale-agnostic: field inference (Task 5), tested with Spanish + English keys. ✓ (§4 principle 2, §5.1)
- Graph + orphans as first-class: Task 7 + the `orphans` command (Task 10). ✓ (§3.2, §5 edges & gaps)
- Read-only commands `init`/`status`/`orphans`: Tasks 8–10. ✓ (§10 Phase 0)
- Deferred to later plans (correctly out of scope here): viewer (Phase 1), FTS/query (Phase 2), atomization (Phase 3), hooks (Phase 4). 

**Placeholder scan:** no TBD/TODO; every code step has complete code; every command has a test with concrete assertions. ✓

**Type consistency:** `Note`, `NoteLink`, `CortexConfig`, `CortexFields`, `Graph`/`GraphNode`/`GraphEdge` are defined once in `types.ts` (Task 1) and imported unchanged. `buildNote(relPath, content, fields)`, `loadConfig(vaultDir, sampleKeys)`, `scanVault(vaultDir, config)`, `buildGraph(notes)`, `runInit/runStatus/runOrphans(vaultDir)` signatures match across their producing and consuming tasks. ✓

## Notes for execution

- Run `npm install` once in `toolkit/` before Task 1's test (the smoke test needs vitest).
- The real-vault smoke tests (Tasks 8/10) are **read-only** except `init`, which writes a `.cortex.json` into the vault — run them against the actual vault only when you want that file created, otherwise use a copy.
- Add `toolkit/dist/` and `toolkit/node_modules/` to `.gitignore` before the first commit that would otherwise include them.
