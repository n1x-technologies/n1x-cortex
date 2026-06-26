# Cortex Phase 6 — Semantic Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, on-device embedding layer that feeds hybrid (lexical + semantic) retrieval into both `cortex query` and `cortex dupes`, built once behind an `Embedder` interface with an `.cortex/embeddings/` cache produced by a new `cortex embed` command.

**Architecture:** A new isolated `src/semantic/` module owns embeddings (transformers.js), a hash-keyed JSON store, cosine, and Reciprocal Rank Fusion. `cortex embed` builds/refreshes the store. `query` fuses lexical+semantic rankings to pick anchors; `dupes` adds semantic pairs from the store. Semantic is strictly additive and degrades to current lexical behavior whenever the store or model is absent.

**Tech Stack:** Node ESM + TypeScript (strict), vitest, `@xenova/transformers` (transformers.js), `gray-matter` (already present).

## Global Constraints

- **Module system:** Node ESM. Every relative import uses an explicit `.js` extension (e.g. `import { cosineDense } from './cosine.js'`), matching the existing codebase.
- **Local-first / privacy:** No vault content ever leaves the machine. No network at query/dupes time except the one-time model download performed by `cortex embed`. No API keys.
- **Semantic never breaks a command:** missing store, model load failure, or stale vectors → fall back to current lexical behavior; never throw out of `query`/`dupes`.
- **Sources never modified:** the store lives under `.cortex/embeddings/`; `Markdown/` (`sourcesDir`) is never written.
- **Exact default config values:** `embedModel = "Xenova/multilingual-e5-small"`, `embedDir = ".cortex/embeddings"`, `semanticDupeThreshold = 0.85`, `rrfK = 60`.
- **e5 prompt convention:** passages are embedded as `"passage: <title>\n<body>"`; queries as `"query: <question>"`.
- **Vectors are normalized** (`pooling: 'mean', normalize: true`) but cosine is computed defensively (no reliance on unit length).
- **Test isolation:** unit/integration tests must run with **no network and no model weights** — they inject a deterministic stub `Embedder`. Only a single optional manual smoke exercises the real model.
- **Run tests from `toolkit/`:** `npm test` (vitest). Build: `npm run build`.

---

### Task 1: Scaffold — dependency, config keys, types, gitignore

**Files:**
- Modify: `toolkit/package.json` (add dependency)
- Modify: `toolkit/src/types.ts` (extend `CortexConfig`)
- Modify: `toolkit/src/config.ts` (defaults in `loadConfig`)
- Modify: `.gitignore` (repo root)
- Test: `toolkit/test/config-semantic.test.ts`

**Interfaces:**
- Produces: `CortexConfig.embedModel: string`, `CortexConfig.embedDir: string`, `CortexConfig.semanticDupeThreshold: number`, `CortexConfig.rrfK: number`.

- [ ] **Step 1: Add the dependency**

In `toolkit/`, run:
```bash
npm install @xenova/transformers@^2.17.2
```
Expected: `package.json` `dependencies` gains `"@xenova/transformers": "^2.17.2"`; `package-lock.json` updates.

- [ ] **Step 2: Extend the config type**

In `toolkit/src/types.ts`, add four fields to the `CortexConfig` interface, right after `dupeThreshold: number;`:
```ts
  dupeThreshold: number;
  embedModel: string;
  embedDir: string;
  semanticDupeThreshold: number;
  rrfK: number;
```

- [ ] **Step 3: Write the failing config test**

Create `toolkit/test/config-semantic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('phase 6 semantic config defaults', () => {
  it('provides embedModel/embedDir/semanticDupeThreshold/rrfK defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cfg6-'));
    const c = loadConfig(dir, []);
    expect(c.embedModel).toBe('Xenova/multilingual-e5-small');
    expect(c.embedDir).toBe('.cortex/embeddings');
    expect(c.semanticDupeThreshold).toBe(0.85);
    expect(c.rrfK).toBe(60);
  });
  it('honors overrides from .cortex.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-cfg6-'));
    writeFileSync(join(dir, '.cortex.json'), JSON.stringify({ embedModel: 'Xenova/bge-small-en', rrfK: 30 }));
    const c = loadConfig(dir, []);
    expect(c.embedModel).toBe('Xenova/bge-small-en');
    expect(c.rrfK).toBe(30);
    expect(c.embedDir).toBe('.cortex/embeddings');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- config-semantic`
Expected: FAIL — `c.embedModel` is `undefined`.

- [ ] **Step 5: Add the defaults**

In `toolkit/src/config.ts`, inside the `defaults` object in `loadConfig`, add the four keys right after `dupeThreshold: 0.45,`:
```ts
    dupeThreshold: 0.45,
    embedModel: 'Xenova/multilingual-e5-small',
    embedDir: '.cortex/embeddings',
    semanticDupeThreshold: 0.85,
    rrfK: 60,
```

- [ ] **Step 6: Ignore the derived artifacts**

In the repo-root `.gitignore`, below the existing `.cortex/out/` line, add:
```
.cortex/embeddings/
.cortex/models/
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- config-semantic`
Expected: PASS (both cases).

- [ ] **Step 8: Commit**

```bash
git add toolkit/package.json toolkit/package-lock.json toolkit/src/types.ts toolkit/src/config.ts toolkit/test/config-semantic.test.ts .gitignore
git commit -m "feat(toolkit): semantic-layer scaffold — deps, config keys, gitignore"
```

---

### Task 2: Cosine similarity helper

**Files:**
- Create: `toolkit/src/semantic/cosine.ts`
- Test: `toolkit/test/semantic-cosine.test.ts`

**Interfaces:**
- Produces: `cosineDense(a: number[], b: number[]): number`

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/semantic-cosine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cosineDense } from '../src/semantic/cosine.js';

describe('cosineDense', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineDense([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineDense([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('returns 0 when a vector is all zeros', () => {
    expect(cosineDense([0, 0], [1, 1])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- semantic-cosine`
Expected: FAIL — cannot find module `cosine.js`.

- [ ] **Step 3: Implement cosine**

Create `toolkit/src/semantic/cosine.ts`:
```ts
export function cosineDense(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- semantic-cosine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/semantic/cosine.ts toolkit/test/semantic-cosine.test.ts
git commit -m "feat(toolkit): semantic cosine helper"
```

---

### Task 3: Reciprocal Rank Fusion

**Files:**
- Create: `toolkit/src/semantic/fuse.ts`
- Test: `toolkit/test/semantic-fuse.test.ts`

**Interfaces:**
- Produces: `rrf(rankings: string[][], k?: number): Map<string, number>` and `rrfOrder(rankings: string[][], k?: number): string[]` (ids best-first, ties broken by id ascending).

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/semantic-fuse.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { rrf, rrfOrder } from '../src/semantic/fuse.js';

describe('reciprocal rank fusion', () => {
  it('rewards items ranked highly in multiple lists', () => {
    const scores = rrf([['a', 'b', 'c'], ['b', 'a', 'd']], 60);
    // a: 1/61 + 1/62 ; b: 1/62 + 1/61 -> a and b tie above c and d
    expect(scores.get('a')! + scores.get('b')!).toBeGreaterThan(scores.get('c')! + scores.get('d')!);
  });
  it('rrfOrder returns ids best-first with stable id tie-break', () => {
    const order = rrfOrder([['x'], ['y']], 60); // x and y both at rank 0 -> equal score -> id order
    expect(order).toEqual(['x', 'y']);
  });
  it('a unique top-ranked item beats one appearing only lower', () => {
    const order = rrfOrder([['top', 'mid'], ['top', 'low']], 60);
    expect(order[0]).toBe('top');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- semantic-fuse`
Expected: FAIL — cannot find module `fuse.js`.

- [ ] **Step 3: Implement RRF**

Create `toolkit/src/semantic/fuse.ts`:
```ts
export function rrf(rankings: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
    });
  }
  return scores;
}

export function rrfOrder(rankings: string[][], k = 60): string[] {
  const scores = rrf(rankings, k);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- semantic-fuse`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/semantic/fuse.ts toolkit/test/semantic-fuse.test.ts
git commit -m "feat(toolkit): reciprocal rank fusion"
```

---

### Task 4: Embedding store + note text helpers

**Files:**
- Create: `toolkit/src/semantic/store.ts`
- Create: `toolkit/src/semantic/text.ts`
- Test: `toolkit/test/semantic-store.test.ts`

**Interfaces:**
- Produces (`store.ts`): `EmbeddingRecord { path: string; hash: string; vector: number[] }`, `EmbeddingStore { model: string; dim: number; records: EmbeddingRecord[] }`, `hashContent(text: string): string`, `storePath(embedDir: string): string`, `loadStore(embedDir: string): EmbeddingStore | null`, `saveStore(embedDir: string, store: EmbeddingStore): void`, `storeMap(store: EmbeddingStore): Map<string, EmbeddingRecord>`.
- Produces (`text.ts`): `noteText(note: Note): string`, `passageText(note: Note): string`, `queryText(question: string): string`.

- [ ] **Step 1: Write the failing test**

Create `toolkit/test/semantic-store.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { hashContent, loadStore, saveStore, storeMap, type EmbeddingStore } from '../src/semantic/store.js';
import { noteText, passageText, queryText } from '../src/semantic/text.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Note } from '../src/types.js';

const note = (over: Partial<Note> = {}): Note => ({
  path: 'N/a.md', id: 'A', title: 'Alpha', type: null, status: null, tags: [],
  meta: {}, folder: 'N', links: [], source: null, body: 'hello world', ...over,
});

describe('embedding store', () => {
  it('hashes content deterministically and changes on edit', () => {
    expect(hashContent('x')).toBe(hashContent('x'));
    expect(hashContent('x')).not.toBe(hashContent('y'));
  });
  it('round-trips a store and returns null when absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-store-'));
    expect(loadStore(dir)).toBeNull();
    const store: EmbeddingStore = { model: 'm', dim: 2, records: [{ path: 'N/a.md', hash: 'h', vector: [1, 2] }] };
    saveStore(dir, store);
    const back = loadStore(dir);
    expect(back).not.toBeNull();
    expect(storeMap(back!).get('N/a.md')!.vector).toEqual([1, 2]);
  });
  it('builds note/passage/query text with e5 prefixes', () => {
    expect(noteText(note())).toBe('Alpha\nhello world');
    expect(passageText(note())).toBe('passage: Alpha\nhello world');
    expect(queryText('find things')).toBe('query: find things');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- semantic-store`
Expected: FAIL — cannot find module `store.js`.

- [ ] **Step 3: Implement the text helpers**

Create `toolkit/src/semantic/text.ts`:
```ts
import type { Note } from '../types.js';

export function noteText(note: Note): string {
  return `${note.title}\n${note.body}`.trim();
}
export function passageText(note: Note): string {
  return `passage: ${noteText(note)}`;
}
export function queryText(question: string): string {
  return `query: ${question}`;
}
```

- [ ] **Step 4: Implement the store**

Create `toolkit/src/semantic/store.ts`:
```ts
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface EmbeddingRecord { path: string; hash: string; vector: number[]; }
export interface EmbeddingStore { model: string; dim: number; records: EmbeddingRecord[]; }

export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function storePath(embedDir: string): string {
  return join(embedDir, 'index.json');
}

export function loadStore(embedDir: string): EmbeddingStore | null {
  const file = storePath(embedDir);
  if (!existsSync(file)) return null;
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as EmbeddingStore;
    if (!s || typeof s.model !== 'string' || !Array.isArray(s.records)) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveStore(embedDir: string, store: EmbeddingStore): void {
  mkdirSync(embedDir, { recursive: true });
  writeFileSync(storePath(embedDir), JSON.stringify(store));
}

export function storeMap(store: EmbeddingStore): Map<string, EmbeddingRecord> {
  const m = new Map<string, EmbeddingRecord>();
  for (const r of store.records) m.set(r.path, r);
  return m;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- semantic-store`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/semantic/store.ts toolkit/src/semantic/text.ts toolkit/test/semantic-store.test.ts
git commit -m "feat(toolkit): embedding store + note text helpers"
```

---

### Task 5: `Embedder` interface + `cortex embed` command

**Files:**
- Create: `toolkit/src/semantic/embedder.ts`
- Create: `toolkit/src/commands/embed.ts`
- Modify: `toolkit/src/cli.ts` (import + `case 'embed'` + usage string)
- Test: `toolkit/test/embed.test.ts`

**Interfaces:**
- Produces (`embedder.ts`): `Embedder { readonly id: string; readonly dim: number; embed(texts: string[]): Promise<Float32Array[]> }`, `createTransformersEmbedder(modelId: string, cacheDir: string): Promise<Embedder>`.
- Produces (`embed.ts`): `EmbedResult { model: string; added: number; changed: number; removed: number; reused: number; total: number }`, `runEmbed(vaultDir: string, opts?: { force?: boolean; model?: string; embedder?: Embedder }): Promise<EmbedResult>`, `formatEmbed(r: EmbedResult): string`.
- Consumes: `loadStore`/`saveStore`/`storeMap`/`hashContent`/`EmbeddingRecord`/`EmbeddingStore` (Task 4), `noteText`/`passageText` (Task 4), `scanVault`/`collectFrontmatterKeys` (existing), `loadConfig` (existing).

- [ ] **Step 1: Implement the embedder**

Create `toolkit/src/semantic/embedder.ts` (the real impl is exercised only by the optional manual smoke; everything else injects a stub):
```ts
export interface Embedder {
  readonly id: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export async function createTransformersEmbedder(modelId: string, cacheDir: string): Promise<Embedder> {
  const { pipeline, env } = await import('@xenova/transformers');
  env.cacheDir = cacheDir;
  env.allowLocalModels = false;
  const extractor = await pipeline('feature-extraction', modelId);
  let dim = 0;
  return {
    id: modelId,
    get dim() { return dim; },
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (const t of texts) {
        const res = await extractor(t, { pooling: 'mean', normalize: true });
        const vec = res.data as Float32Array;
        dim = vec.length;
        out.push(Float32Array.from(vec));
      }
      return out;
    },
  };
}
```

- [ ] **Step 2: Write the failing test (stub embedder, no network)**

Create `toolkit/test/embed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runEmbed } from '../src/commands/embed.js';
import { loadStore } from '../src/semantic/store.js';
import type { Embedder } from '../src/semantic/embedder.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// deterministic stub: vector depends on whether text mentions "alpha"
const stub: Embedder = {
  id: 'stub', dim: 3,
  async embed(texts) { return texts.map(t => Float32Array.from(t.includes('alpha') ? [1, 0, 0] : [0, 1, 0])); },
};

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-embed-'));
  mkdirSync(join(dir, 'N'));
  writeFileSync(join(dir, 'N', 'a.md'), '# A\n\nalpha content here');
  writeFileSync(join(dir, 'N', 'b.md'), '# B\n\nbeta content here');
  return dir;
}

describe('runEmbed', () => {
  it('embeds all notes on first run and writes the store', async () => {
    const dir = vault();
    const r = await runEmbed(dir, { embedder: stub, model: 'stub' });
    expect(r.added).toBe(2);
    expect(r.changed).toBe(0);
    expect(r.total).toBe(2);
    const store = loadStore(resolve(dir, '.cortex/embeddings'));
    expect(store!.model).toBe('stub');
    expect(store!.records.length).toBe(2);
    expect(store!.dim).toBe(3);
  });

  it('reuses unchanged notes and re-embeds only edits on the second run', async () => {
    const dir = vault();
    await runEmbed(dir, { embedder: stub, model: 'stub' });
    writeFileSync(join(dir, 'N', 'a.md'), '# A\n\nalpha content EDITED');
    const r = await runEmbed(dir, { embedder: stub, model: 'stub' });
    expect(r.reused).toBe(1);
    expect(r.changed).toBe(1);
    expect(r.added).toBe(0);
  });

  it('drops deleted notes from the store count via removed', async () => {
    const dir = vault();
    await runEmbed(dir, { embedder: stub, model: 'stub' });
    // simulate deletion by pointing a second vault run at fewer notes is overkill;
    // instead re-run after removing b.md
    const { rmSync } = await import('node:fs');
    rmSync(join(dir, 'N', 'b.md'));
    const r = await runEmbed(dir, { embedder: stub, model: 'stub' });
    expect(r.removed).toBe(1);
    expect(r.total).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- embed`
Expected: FAIL — cannot find module `embed.js`.

- [ ] **Step 4: Implement the command**

Create `toolkit/src/commands/embed.ts`:
```ts
import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { loadStore, saveStore, storeMap, hashContent, type EmbeddingStore, type EmbeddingRecord } from '../semantic/store.js';
import { noteText, passageText } from '../semantic/text.js';
import { createTransformersEmbedder, type Embedder } from '../semantic/embedder.js';

export interface EmbedResult {
  model: string;
  added: number;
  changed: number;
  removed: number;
  reused: number;
  total: number;
}

export async function runEmbed(
  vaultDir: string,
  opts: { force?: boolean; model?: string; embedder?: Embedder } = {},
): Promise<EmbedResult> {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const model = opts.model ?? config.embedModel;
  const embedDir = resolve(vaultDir, config.embedDir);

  const prev = loadStore(embedDir);
  const usable = !opts.force && prev && prev.model === model ? prev : null;
  const prevMap = usable ? storeMap(usable) : new Map<string, EmbeddingRecord>();

  const records: EmbeddingRecord[] = [];
  const toEmbed: { path: string; hash: string; text: string }[] = [];
  let reused = 0, changed = 0, added = 0;

  for (const note of notes) {
    const hash = hashContent(noteText(note));
    const prevRec = prevMap.get(note.path);
    if (prevRec && prevRec.hash === hash) {
      records.push(prevRec);
      reused++;
    } else {
      if (prevRec) changed++; else added++;
      toEmbed.push({ path: note.path, hash, text: passageText(note) });
    }
  }

  let dim = usable?.dim ?? 0;
  if (toEmbed.length) {
    const embedder = opts.embedder ?? await createTransformersEmbedder(model, resolve(vaultDir, '.cortex/models'));
    const vectors = await embedder.embed(toEmbed.map(t => t.text));
    toEmbed.forEach((t, i) => {
      const vec = Array.from(vectors[i]);
      if (vec.length) dim = vec.length;
      records.push({ path: t.path, hash: t.hash, vector: vec });
    });
  }

  const livePaths = new Set(notes.map(n => n.path));
  const removed = usable ? usable.records.filter(r => !livePaths.has(r.path)).length : 0;

  const store: EmbeddingStore = { model, dim, records };
  saveStore(embedDir, store);
  return { model, added, changed, removed, reused, total: records.length };
}

export function formatEmbed(r: EmbedResult): string {
  return `Embedded with ${r.model}: +${r.added} new, ~${r.changed} changed, -${r.removed} removed, ${r.reused} reused (store: ${r.total} notes).`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- embed`
Expected: PASS (all three cases).

- [ ] **Step 6: Wire the CLI**

In `toolkit/src/cli.ts`, add the import near the other command imports:
```ts
import { runEmbed, formatEmbed } from './commands/embed.js';
```
Add a new case before `case 'gaps':`:
```ts
    case 'embed': {
      const rest = argv.slice(1);
      const force = rest.includes('--force');
      const mi = rest.indexOf('--model');
      const model = mi >= 0 ? rest[mi + 1] : undefined;
      console.log(formatEmbed(await runEmbed(cwd, { force, model })));
      return 0;
    }
```
Update the `default:` usage string to include `embed`:
```ts
      console.log('Usage: cortex <init|status|orphans|viz|query|atomize|promote|undo|set-status|hook|pause|resume|embed|gaps|dupes|verify|moc|doc>');
```

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS (no regressions).
Run: `npm run build`
Expected: `tsc` completes with no errors.

- [ ] **Step 8: (Optional) Manual smoke with the real model**

Only if a network connection is available (downloads ~120MB on first run):
```bash
npm run cli -- embed
```
Expected: prints `Embedded with Xenova/multilingual-e5-small: +N new, ...`; creates `.cortex/embeddings/index.json` and `.cortex/models/`. Not part of the automated suite.

- [ ] **Step 9: Commit**

```bash
git add toolkit/src/semantic/embedder.ts toolkit/src/commands/embed.ts toolkit/src/cli.ts toolkit/test/embed.test.ts
git commit -m "feat(toolkit): cortex embed — build/refresh the embedding store"
```

---

### Task 6: Semantic query (vector search + hybrid anchors)

**Files:**
- Create: `toolkit/src/semantic/queryRank.ts`
- Modify: `toolkit/src/query/retrieve.ts` (fusion-aware anchor selection)
- Modify: `toolkit/src/commands/query.ts` (add async `runQuerySemantic`; keep sync `runQuery`)
- Modify: `toolkit/src/cli.ts` (`case 'query'` calls the async variant)
- Test: `toolkit/test/retrieve-semantic.test.ts`, `toolkit/test/semantic-query.test.ts`

**Interfaces:**
- Produces (`queryRank.ts`): `semanticQueryRanking(vaultDir: string, config: CortexConfig, notes: Note[], question: string, embedder?: Embedder): Promise<string[]>` (note **ids**, best-first; `[]` when degraded).
- Produces (`query.ts`): `runQuerySemantic(vaultDir: string, question: string): Promise<QueryResult>`. `runQuery` keeps its existing sync signature `(vaultDir, question) => QueryResult` (lexical only; used by the hook).
- Consumes: `retrieve` (extended opts below), `rrfOrder` (Task 3), `loadStore`/`storeMap`/`hashContent` (Task 4), `noteText`/`queryText` (Task 4), `cosineDense` (Task 2), `createTransformersEmbedder`/`Embedder` (Task 5).

- [ ] **Step 1: Write the failing retrieve-fusion test**

Create `toolkit/test/retrieve-semantic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { retrieve } from '../src/query/retrieve.js';
import { buildGraph } from '../src/graph.js';
import type { Note } from '../src/types.js';

const note = (id: string, body: string): Note => ({
  path: `N/${id}.md`, id, title: id, type: null, status: null, tags: [],
  meta: {}, folder: 'N', links: [], source: null, body,
});

describe('retrieve with semantic ranking', () => {
  const notes = [note('A', 'the operation limit is five units'), note('C', 'completely unrelated text about gardening')];
  const graph = buildGraph(notes);

  it('without a semantic ranking, C (no lexical match) is not an anchor', () => {
    const r = retrieve(notes, graph, 'operation limit', { maxHits: 5 });
    expect(r.hits.find(h => h.id === 'C')).toBeUndefined();
  });

  it('a semantic ranking promotes C into the anchors', () => {
    const r = retrieve(notes, graph, 'operation limit', { maxHits: 5, semanticRanking: ['C', 'A'], rrfK: 60 });
    const c = r.hits.find(h => h.id === 'C');
    expect(c).toBeDefined();
    expect(c!.via).toBe('anchor');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- retrieve-semantic`
Expected: FAIL — `retrieve` ignores `semanticRanking` (C absent in the second case).

- [ ] **Step 3: Make `retrieve` fusion-aware**

In `toolkit/src/query/retrieve.ts`, add the import at the top:
```ts
import { rrfOrder } from '../semantic/fuse.js';
```
Extend the `opts` parameter type to include the two new fields:
```ts
  opts: { maxAnchors?: number; hops?: number; maxHits?: number; semanticRanking?: string[]; rrfK?: number } = {},
```
Replace the anchor-selection block. Find:
```ts
  const anchorIds = ranked.slice(0, maxAnchors).map(r => notes[r.index].id);
  const anchorSet = new Set(anchorIds);
```
Replace with:
```ts
  const lexicalIds = ranked.map(r => notes[r.index].id);
  const order = opts.semanticRanking && opts.semanticRanking.length
    ? rrfOrder([lexicalIds, opts.semanticRanking], opts.rrfK ?? 60)
    : lexicalIds;
  const anchorIds = order.filter(id => byId.has(id)).slice(0, maxAnchors);
  const anchorSet = new Set(anchorIds);
```
(Note: `byId` is already constructed above this block in the existing code, so it is in scope.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- retrieve-semantic`
Expected: PASS. Also run `npm test -- retrieve` (the existing test) → still PASS (no `semanticRanking` ⇒ identical behavior).

- [ ] **Step 5: Write the failing semantic-ranking test (stub embedder)**

Create `toolkit/test/semantic-query.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { semanticQueryRanking } from '../src/semantic/queryRank.js';
import { runEmbed } from '../src/commands/embed.js';
import { loadConfig } from '../src/config.js';
import { scanVault, collectFrontmatterKeys } from '../src/vault.js';
import type { Embedder } from '../src/semantic/embedder.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stub: Embedder = {
  id: 'stub', dim: 3,
  async embed(texts) { return texts.map(t => Float32Array.from(t.includes('alpha') ? [1, 0, 0] : [0, 1, 0])); },
};

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-sq-'));
  mkdirSync(join(dir, 'N'));
  writeFileSync(join(dir, 'N', 'a.md'), '# A\n\nalpha topic');
  writeFileSync(join(dir, 'N', 'b.md'), '# B\n\nbeta topic');
  return dir;
}

describe('semanticQueryRanking', () => {
  it('returns [] when no store exists (graceful degradation)', async () => {
    const dir = vault();
    const config = loadConfig(dir, collectFrontmatterKeys(dir));
    const notes = scanVault(dir, config);
    expect(await semanticQueryRanking(dir, config, notes, 'beta', stub)).toEqual([]);
  });

  it('ranks the semantically closest note first', async () => {
    const dir = vault();
    // build a store whose model matches config.embedModel so the ranking activates
    const config = loadConfig(dir, collectFrontmatterKeys(dir));
    await runEmbed(dir, { embedder: stub, model: config.embedModel });
    const notes = scanVault(dir, config);
    const ranking = await semanticQueryRanking(dir, config, notes, 'beta query', stub);
    expect(ranking[0]).toBe('B'); // query "beta" -> [0,1,0] -> closest to note B
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- semantic-query`
Expected: FAIL — cannot find module `queryRank.js`.

- [ ] **Step 7: Implement `semanticQueryRanking`**

Create `toolkit/src/semantic/queryRank.ts`:
```ts
import { resolve } from 'node:path';
import { loadStore, storeMap, hashContent } from './store.js';
import { noteText, queryText } from './text.js';
import { cosineDense } from './cosine.js';
import { createTransformersEmbedder, type Embedder } from './embedder.js';
import type { Note, CortexConfig } from '../types.js';

export async function semanticQueryRanking(
  vaultDir: string,
  config: CortexConfig,
  notes: Note[],
  question: string,
  embedder?: Embedder,
): Promise<string[]> {
  const store = loadStore(resolve(vaultDir, config.embedDir));
  if (!store || store.model !== config.embedModel || !store.records.length) return [];

  const recMap = storeMap(store);
  const fresh: { id: string; vector: number[] }[] = [];
  for (const note of notes) {
    const rec = recMap.get(note.path);
    if (!rec || rec.hash !== hashContent(noteText(note))) continue; // missing or stale → skip
    fresh.push({ id: note.id, vector: rec.vector });
  }
  if (!fresh.length) return [];

  let qvec: number[];
  try {
    const emb = embedder ?? await createTransformersEmbedder(config.embedModel, resolve(vaultDir, '.cortex/models'));
    const [v] = await emb.embed([queryText(question)]);
    qvec = Array.from(v);
  } catch {
    return []; // model unavailable → degrade to lexical
  }

  return fresh
    .map(f => ({ id: f.id, score: cosineDense(qvec, f.vector) }))
    .sort((a, b) => b.score - a.score)
    .map(f => f.id);
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm test -- semantic-query`
Expected: PASS (both cases).

- [ ] **Step 9: Add `runQuerySemantic` and wire the CLI**

In `toolkit/src/commands/query.ts`, add imports:
```ts
import { semanticQueryRanking } from '../semantic/queryRank.js';
import { buildGraph } from '../graph.js';
```
(`buildGraph` is likely already imported — if so, do not duplicate it.) Add the async variant below the existing `runQuery` (leave `runQuery` exactly as it is):
```ts
export async function runQuerySemantic(vaultDir: string, question: string): Promise<QueryResult> {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);
  const semanticRanking = await semanticQueryRanking(vaultDir, config, notes, question);
  return retrieve(notes, graph, question, { semanticRanking, rrfK: config.rrfK });
}
```
In `toolkit/src/cli.ts`, change the query import to include the new function:
```ts
import { runQuery, runQuerySemantic, formatQuery } from './commands/query.js';
```
And update the `case 'query'` body line to await the semantic variant:
```ts
      console.log(formatQuery(await runQuerySemantic(cwd, question)));
```

- [ ] **Step 10: Run the full suite + typecheck**

Run: `npm test`
Expected: PASS (existing `query.test.ts` still uses the sync `runQuery` and is unaffected).
Run: `npm run build`
Expected: no `tsc` errors.

- [ ] **Step 11: Commit**

```bash
git add toolkit/src/semantic/queryRank.ts toolkit/src/query/retrieve.ts toolkit/src/commands/query.ts toolkit/src/cli.ts toolkit/test/retrieve-semantic.test.ts toolkit/test/semantic-query.test.ts
git commit -m "feat(toolkit): hybrid semantic query (vector search + fused anchors)"
```

---

### Task 7: Semantic dupes (store-backed pairs)

**Files:**
- Modify: `toolkit/src/curate/dupes.ts` (extend `DupePair`; add semantic pairs from the store)
- Modify: `toolkit/src/commands/dupes.ts` (`formatDupes` annotates lexical/semantic/both)
- Test: `toolkit/test/dupes-semantic.test.ts`

**Interfaces:**
- Produces: `DupePair { a: string; b: string; lexical: number; semantic: number; via: 'lexical' | 'semantic' | 'both'; score: number }` (keeps `a`/`b`/`score`, so the existing `dupes.test.ts` continues to pass).
- Consumes: `loadStore`/`storeMap`/`hashContent` (Task 4), `noteText` (Task 4), `cosineDense` (Task 2).

- [ ] **Step 1: Write the failing test (store with crafted vectors, no network)**

Create `toolkit/test/dupes-semantic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeDupes } from '../src/curate/dupes.js';
import { runEmbed } from '../src/commands/embed.js';
import { loadConfig } from '../src/config.js';
import type { Embedder } from '../src/semantic/embedder.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// stub returns the SAME vector for every note -> cosine 1.0 between any pair
const stub: Embedder = { id: 'stub', dim: 3, async embed(texts) { return texts.map(() => Float32Array.from([1, 0, 0])); } };

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-dsem-'));
  mkdirSync(join(dir, 'N'));
  // lexically disjoint (no shared tokens) but semantically identical per the stub
  writeFileSync(join(dir, 'N', 'es.md'), '# Silencio\n\nEl acusado renuncio a guardar silencio durante interrogatorio.');
  writeFileSync(join(dir, 'N', 'en.md'), '# Miranda\n\nDefendant waived Fifth Amendment protections before questioning.');
  return dir;
}

describe('computeDupes semantic', () => {
  it('surfaces a semantic-only pair that TF-IDF misses', async () => {
    const dir = vault();
    const config = loadConfig(dir, []);
    await runEmbed(dir, { embedder: stub, model: config.embedModel });
    const pairs = computeDupes(dir, config, config.dupeThreshold);
    expect(pairs.length).toBe(1);
    expect(pairs[0].via).toBe('semantic');
    expect(pairs[0].semantic).toBeGreaterThanOrEqual(config.semanticDupeThreshold);
    expect(pairs[0].lexical).toBe(0);
  });

  it('without a store, behaves exactly as the lexical engine (no pairs here)', () => {
    const dir = vault();
    const config = loadConfig(dir, []);
    expect(computeDupes(dir, config, config.dupeThreshold).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- dupes-semantic`
Expected: FAIL — `via`/`semantic` undefined; only the lexical engine runs.

- [ ] **Step 3: Rewrite `computeDupes` to merge lexical + semantic pairs**

Replace the entire contents of `toolkit/src/curate/dupes.ts` with:
```ts
// toolkit/src/curate/dupes.ts
import { resolve } from 'node:path';
import { scanVault } from '../vault.js';
import { buildIndex } from '../search/index.js';
import { loadStore, storeMap, hashContent } from '../semantic/store.js';
import { noteText } from '../semantic/text.js';
import { cosineDense } from '../semantic/cosine.js';
import type { CortexConfig } from '../types.js';

export interface DupePair {
  a: string;
  b: string;
  lexical: number;
  semantic: number;
  via: 'lexical' | 'semantic' | 'both';
  score: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const pairKey = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);

export function computeDupes(vaultDir: string, config: CortexConfig, threshold: number): DupePair[] {
  const notes = scanVault(vaultDir, config);
  const merged = new Map<string, DupePair>();

  // ── Lexical pairs (TF-IDF cosine via inverted index) ──
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
  for (const idxs of inverted.values()) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = idxs[x], j = idxs[y];
        if (i === j) continue;
        const k = i < j ? `${i}:${j}` : `${j}:${i}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const [small, large] = vecs[i].size < vecs[j].size ? [vecs[i], vecs[j]] : [vecs[j], vecs[i]];
        let dot = 0;
        for (const [t, w] of small) { const w2 = large.get(t); if (w2) dot += w * w2; }
        const cos = dot / (norms[i] * norms[j]);
        if (cos >= threshold) {
          const [a, b] = [notes[i].path, notes[j].path].sort();
          merged.set(pairKey(a, b), { a, b, lexical: round2(cos), semantic: 0, via: 'lexical', score: round2(cos) });
        }
      }
    }
  }

  // ── Semantic pairs (dense cosine over the embedding store) ──
  const store = loadStore(resolve(vaultDir, config.embedDir));
  if (store && store.model === config.embedModel && store.records.length) {
    const recMap = storeMap(store);
    const dense: { path: string; vector: number[] }[] = [];
    for (const n of notes) {
      const rec = recMap.get(n.path);
      if (rec && rec.hash === hashContent(noteText(n))) dense.push({ path: n.path, vector: rec.vector });
    }
    for (let i = 0; i < dense.length; i++) {
      for (let j = i + 1; j < dense.length; j++) {
        const cos = cosineDense(dense[i].vector, dense[j].vector);
        if (cos >= config.semanticDupeThreshold) {
          const [a, b] = [dense[i].path, dense[j].path].sort();
          const key = pairKey(a, b);
          const ex = merged.get(key);
          if (ex) {
            ex.semantic = round2(cos);
            ex.via = 'both';
            ex.score = Math.max(ex.lexical, ex.semantic);
          } else {
            merged.set(key, { a, b, lexical: 0, semantic: round2(cos), via: 'semantic', score: round2(cos) });
          }
        }
      }
    }
  }

  return [...merged.values()].sort(
    (p, q) => q.score - p.score || p.a.localeCompare(q.a) || p.b.localeCompare(q.b),
  );
}
```

- [ ] **Step 4: Update `formatDupes` to annotate the signal**

In `toolkit/src/commands/dupes.ts`, replace the `formatDupes` function with:
```ts
export function formatDupes(pairs: DupePair[]): string {
  if (!pairs.length) return 'No near-duplicate notes found.';
  const lines = [`Near-duplicate pairs (merge candidates): ${pairs.length}`];
  for (const p of pairs.slice(0, 50)) {
    const tag = p.via === 'both'
      ? `both  lex ${p.lexical.toFixed(2)} sem ${p.semantic.toFixed(2)}`
      : p.via === 'semantic'
        ? `semantic ${p.semantic.toFixed(2)}`
        : `lexical ${p.lexical.toFixed(2)}`;
    lines.push(`  ${p.score.toFixed(2)}  ${p.a}  ⇄  ${p.b}   [${tag}]`);
  }
  return lines.join('\n');
}
```
(The `runDupes` function and the `import { computeDupes, type DupePair }` line stay unchanged.)

- [ ] **Step 5: Run the new test, the existing dupes test, and the full suite**

Run: `npm test -- dupes-semantic`
Expected: PASS (both cases).
Run: `npm test -- "dupes"`
Expected: PASS — existing `dupes.test.ts` still green (`a`/`b`/`score` preserved; no store ⇒ lexical-only).
Run: `npm test`
Expected: PASS (no regressions).
Run: `npm run build`
Expected: no `tsc` errors.

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/curate/dupes.ts toolkit/src/commands/dupes.ts toolkit/test/dupes-semantic.test.ts
git commit -m "feat(toolkit): semantic dupes — store-backed pairs fused with lexical"
```

---

### Task 8: Documentation (README + CLAUDE.md)

**Files:**
- Modify: `README.md` (toolkit command list / phase status)
- Modify: `CLAUDE.md` (file inventory `toolkit/` row — add `embed` + semantic note)

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the README**

In `README.md`, find the toolkit command enumeration (the list including `query`/`atomize`/`gaps`/`dupes`/`moc`/`doc`) and add `embed` to it, plus a one-line description of the semantic layer. Use this sentence (place it in the toolkit section near the dupes/query description):
> **Phase 6 (semantic layer):** `cortex embed` builds a local embedding store (`.cortex/embeddings/`, transformers.js, no network at query time); `query` and `dupes` then run **hybrid** lexical+semantic retrieval (Reciprocal Rank Fusion), degrading to TF-IDF when no store is present.

If the README has a toolkit version/phase badge, bump its phase label to include Phase 6.

- [ ] **Step 2: Update CLAUDE.md inventory**

In `CLAUDE.md`, in the `toolkit/` row of the file-inventory table, add `embed` to the listed CLI commands and append this sentence to that row:
> Phase 6 adds the semantic layer — `cortex embed` builds a local, on-device embedding store (transformers.js) under `.cortex/embeddings/`, and `query`/`dupes` run hybrid lexical+semantic retrieval (RRF) that degrades to TF-IDF when the store is absent. No vault content leaves the machine.

- [ ] **Step 3: Verify the docs reference reality**

Run: `npm test` (from `toolkit/`) once more.
Expected: PASS. (Sanity check that nothing in the doc edits implies an unbuilt command.)

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document Phase 6 semantic layer (cortex embed + hybrid query/dupes)"
```

---

## Self-Review

**Spec coverage** (each spec section → task):
- §3.1 `Embedder` interface → Task 5. §3.2 store → Task 4. §3.3 RRF → Task 3. cosine → Task 2.
- §4 `cortex embed` → Task 5. §5.1 hybrid query → Task 6. §5.2 hybrid dupes → Task 7.
- §6 config keys + gitignore → Task 1. §7 graceful degradation → Tasks 6 (`semanticQueryRanking` returns `[]`; try/catch on model) + 7 (store-absent path) + 1 (defaults). §8 testing (stub `Embedder`, no network) → Tasks 5–7. §9 out-of-scope → not implemented (correct).

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every test step shows full test bodies.

**Type consistency:** `cosineDense`, `rrf`/`rrfOrder`, `EmbeddingRecord`/`EmbeddingStore`, `hashContent`/`loadStore`/`saveStore`/`storeMap`, `noteText`/`passageText`/`queryText`, `Embedder`/`createTransformersEmbedder`, `runEmbed`/`EmbedResult`/`formatEmbed`, `semanticQueryRanking`, `runQuerySemantic`, `DupePair` — names are identical across the tasks that define and consume them. `retrieve` opts extended with `semanticRanking`/`rrfK` and consumed consistently. `runQuery` stays sync (hook caller untouched); only the CLI moves to `runQuerySemantic`.

**Decision recorded:** the `Stop`/grounding hook (`hooks/handlers.ts`) keeps the sync lexical `runQuery` so no model load happens inside a lifecycle hook; semantic is CLI-only for `query`.
