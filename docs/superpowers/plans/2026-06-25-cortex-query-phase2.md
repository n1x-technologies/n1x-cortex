# Cortex Query (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cortex query "<question>"` — mechanical, deterministic retrieval that returns a ranked, **cited** context (the relevant notes, their excerpts, and their source citations) so an AI (or human) can answer from real sources. No model call, no API key.

**Architecture:** A new `src/search/` (in-memory full-text index over notes) + `src/query/` (the retrieval pipeline) on top of the Phase 0 engine. Retrieval is 100% mechanical: **anchor** (full-text + tag/type score) → **traverse** the wikilink graph (both directions, N hops) → **rank** by relevance + link-proximity → assemble a `QueryResult` with per-hit excerpts and a deduped citation list. The natural-language answer is drafted downstream by whoever reads the context (in Claude Code, Claude is the model).

**Tech Stack:** Node ≥ 20, TypeScript (ESM), vitest. Pure JS in-memory TF-IDF (no native deps, no SQLite, no embeddings).

## Global Constraints

- **Builds on Phase 0** (`toolkit/`): reuse `loadConfig`, `collectFrontmatterKeys`, `scanVault`, `buildGraph`, types. Reuse `Note`/`Graph`.
- **ESM** (`.js` import extensions), Node ≥ 20.
- **Mechanical & deterministic:** no model/LLM call, no network, no API key. Same vault → same result. The engine emits the cited context; drafting the prose answer is the model's job, outside the engine.
- **Read-only:** `query` never writes to the vault.
- **Locale-agnostic:** tokenization and scoring are language-neutral (Unicode-aware); a small bilingual stopword list (en+es) is acceptable but matching must never hardcode field names.
- **Citation is mandatory:** every hit carries its `source` (and its own path is a citable anchor); the result exposes a deduped `sources` list.
- **Tool language English** (code, CLI labels). Package root `toolkit/`.
- **Tests:** TDD for every module.

---

## File Structure

```
toolkit/
├── src/types.ts            — add QueryHit, QueryResult (modify)
├── src/search/
│   ├── tokenize.ts         — tokenize(text) → terms (Unicode, stopword-filtered)
│   └── index.ts            — buildIndex(notes) / searchIndex(index, query)
├── src/query/
│   ├── excerpt.ts          — excerpt(body, query) → best matching line
│   └── retrieve.ts         — retrieve(notes, graph, question, opts) → QueryResult
├── src/commands/query.ts   — runQuery(vaultDir, question), formatQuery(result)
├── src/cli.ts              — add `query` case (modify)
└── test/
    ├── tokenize.test.ts
    ├── searchIndex.test.ts
    ├── excerpt.test.ts
    ├── retrieve.test.ts
    └── query.test.ts
```

---

### Task 1: Query types + tokenizer

**Files:**
- Modify: `toolkit/src/types.ts` (append query types)
- Create: `toolkit/src/search/tokenize.ts`
- Test: `toolkit/test/tokenize.test.ts`

**Interfaces:**
- Produces:
  `QueryHit { path: string; id: string; title: string; type: string | null; score: number; excerpt: string; source: string | null; via: 'anchor' | 'link' }`;
  `QueryResult { question: string; anchors: string[]; hits: QueryHit[]; sources: string[] }`;
  `tokenize(text: string): string[]`.

- [ ] **Step 1: Append the query types to `types.ts`**

```ts
// ── Query (Phase 2) ────────────────────────────────────────────────
export interface QueryHit {
  path: string;
  id: string;
  title: string;
  type: string | null;
  score: number;
  excerpt: string;
  source: string | null;
  via: 'anchor' | 'link';
}

export interface QueryResult {
  question: string;
  anchors: string[];
  hits: QueryHit[];
  sources: string[];
}
```

- [ ] **Step 2: Write the failing tokenizer test**

```ts
// toolkit/test/tokenize.test.ts
import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/search/tokenize.js';

describe('tokenize', () => {
  it('lowercases, splits on punctuation, drops 1-char tokens and stopwords', () => {
    expect(tokenize('The límite de Operación-X is 5!')).toEqual(['límite', 'operación', 'x5'].filter(t => t !== 'x5'));
  });
  it('keeps unicode letters and numbers', () => {
    expect(tokenize('Año 2026 régimen')).toEqual(['año', '2026', 'régimen']);
  });
  it('returns empty for only stopwords/punctuation', () => {
    expect(tokenize('the of a , . !')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd toolkit && npm test -- tokenize`
Expected: FAIL — cannot find module `../src/search/tokenize.js`.

- [ ] **Step 4: Write the implementation**

```ts
// toolkit/src/search/tokenize.ts
const STOP = new Set([
  'the','a','an','of','to','in','and','or','is','are','be','for','on','with','that','this','it','as','at','by','from',
  'de','la','el','los','las','un','una','y','o','en','para','del','al','que','con','por','se','su','lo','es','son',
]);

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.filter(t => t.length > 1 && !STOP.has(t));
}
```

- [ ] **Step 5: Fix the test's first case (it was written to illustrate; make it concrete)**

Replace the first test's expectation with the real, deterministic output:
```ts
  it('lowercases, splits on punctuation, drops 1-char tokens and stopwords', () => {
    expect(tokenize('The límite de Operación-X is 5!')).toEqual(['límite', 'operación', '5']);
  });
```
(`The`,`de`,`is` are stopwords; `X` is 1-char and dropped; `5` is kept.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd toolkit && npm test -- tokenize`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/types.ts toolkit/src/search/tokenize.ts toolkit/test/tokenize.test.ts
git commit -m "feat(toolkit): query types and a unicode tokenizer"
```

---

### Task 2: In-memory full-text index

**Files:**
- Create: `toolkit/src/search/index.ts`
- Test: `toolkit/test/searchIndex.test.ts`

**Interfaces:**
- Consumes: `tokenize` (tokenize.js), `Note` (types.js).
- Produces:
  - `buildIndex(notes: Note[]): SearchIndex` where `SearchIndex { notes: Note[]; df: Map<string, number>; tf: Map<number, Map<string, number>> }`.
  - `searchIndex(index: SearchIndex, query: string): { index: number; score: number }[]` — TF-IDF, title+tags weighted, sorted desc, only positive scores.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/searchIndex.test.ts
import { describe, it, expect } from 'vitest';
import { buildIndex, searchIndex } from '../src/search/index.js';
import type { Note } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}

describe('searchIndex', () => {
  const notes = [
    note({ id: 'LIMIT', title: 'Operation limit', body: 'The applicable limit for an operation is defined here.' }),
    note({ id: 'OTHER', title: 'Colors', body: 'Unrelated note about colors and shapes.' }),
    note({ id: 'MENTION', title: 'Process', body: 'A process that mentions the limit only once.' }),
  ];
  const index = buildIndex(notes);

  it('ranks the most relevant note first', () => {
    const r = searchIndex(index, 'operation limit');
    expect(notes[r[0].index].id).toBe('LIMIT');
  });
  it('returns only notes that match, sorted by score desc', () => {
    const r = searchIndex(index, 'limit');
    const ids = r.map(x => notes[x.index].id);
    expect(ids).toContain('LIMIT');
    expect(ids).toContain('MENTION');
    expect(ids).not.toContain('OTHER');
    expect(r[0].score).toBeGreaterThanOrEqual(r[r.length - 1].score);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- searchIndex`
Expected: FAIL — cannot find module `../src/search/index.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/search/index.ts
import { tokenize } from './tokenize.js';
import type { Note } from '../types.js';

export interface SearchIndex {
  notes: Note[];
  df: Map<string, number>;
  tf: Map<number, Map<string, number>>;
}

export function buildIndex(notes: Note[]): SearchIndex {
  const df = new Map<string, number>();
  const tf = new Map<number, Map<string, number>>();
  notes.forEach((n, i) => {
    const terms = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokenize(text)) terms.set(t, (terms.get(t) ?? 0) + weight);
    };
    add(n.title, 3);
    add(n.tags.join(' '), 2);
    add(n.body, 1);
    tf.set(i, terms);
    for (const t of terms.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  });
  return { notes, df, tf };
}

export function searchIndex(index: SearchIndex, query: string): { index: number; score: number }[] {
  const qterms = tokenize(query);
  const N = Math.max(1, index.notes.length);
  const out: { index: number; score: number }[] = [];
  for (const [i, terms] of index.tf) {
    let score = 0;
    for (const qt of qterms) {
      const f = terms.get(qt);
      if (!f) continue;
      const idf = Math.log(1 + N / (index.df.get(qt) ?? 1));
      score += f * idf;
    }
    if (score > 0) out.push({ index: i, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- searchIndex`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/search/index.ts toolkit/test/searchIndex.test.ts
git commit -m "feat(toolkit): in-memory TF-IDF search index over notes"
```

---

### Task 3: Excerpt extraction

**Files:**
- Create: `toolkit/src/query/excerpt.ts`
- Test: `toolkit/test/excerpt.test.ts`

**Interfaces:**
- Consumes: `tokenize` (tokenize.js).
- Produces: `excerpt(body: string, query: string, maxLen?: number): string` — the body line with the most query-term matches (skipping headings/frontmatter/links-only lines), truncated to `maxLen` (default 200).

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/excerpt.test.ts
import { describe, it, expect } from 'vitest';
import { excerpt } from '../src/query/excerpt.js';

describe('excerpt', () => {
  it('returns the line with the most query-term matches', () => {
    const body = '# Title\n\nIntro line.\nThe applicable limit for an operation is 5 units.\nUnrelated trailing line.';
    expect(excerpt(body, 'operation limit')).toBe('The applicable limit for an operation is 5 units.');
  });
  it('falls back to the first content line when nothing matches', () => {
    const body = '# Title\n\nFirst real line.\nSecond line.';
    expect(excerpt(body, 'zzz')).toBe('First real line.');
  });
  it('truncates long lines with an ellipsis', () => {
    const long = 'x'.repeat(300);
    const out = excerpt(`# T\n\n${long}`, 'x', 50);
    expect(out.length).toBe(50);
    expect(out.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- excerpt`
Expected: FAIL — cannot find module `../src/query/excerpt.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/query/excerpt.ts
import { tokenize } from '../search/tokenize.js';

export function excerpt(body: string, query: string, maxLen = 200): string {
  const qset = new Set(tokenize(query));
  const lines = body.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('> '));

  let best = '';
  let bestScore = -1;
  for (const line of lines) {
    const score = tokenize(line).filter(t => qset.has(t)).length;
    if (score > bestScore) { bestScore = score; best = line; }
  }
  if (bestScore <= 0) best = lines[0] ?? '';
  return best.length > maxLen ? best.slice(0, maxLen - 1) + '…' : best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- excerpt`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/query/excerpt.ts toolkit/test/excerpt.test.ts
git commit -m "feat(toolkit): extract a query-relevant excerpt from a note body"
```

---

### Task 4: Retrieval pipeline

**Files:**
- Create: `toolkit/src/query/retrieve.ts`
- Test: `toolkit/test/retrieve.test.ts`

**Interfaces:**
- Consumes: `buildIndex`/`searchIndex` (search/index.js), `excerpt` (query/excerpt.js), `Note`/`Graph`/`QueryResult`/`QueryHit` (types.js).
- Produces: `retrieve(notes: Note[], graph: Graph, question: string, opts?: { maxAnchors?: number; hops?: number; maxHits?: number }): QueryResult`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/retrieve.test.ts
import { describe, it, expect } from 'vitest';
import { retrieve } from '../src/query/retrieve.js';
import { buildGraph } from '../src/graph.js';
import type { Note } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}

describe('retrieve', () => {
  const notes = [
    note({ id: 'RULE-LIMIT', path: '03-Rules/limit.md', title: 'Operation limit', source: 'FUENTE-rules',
           body: 'The applicable limit for an operation of type X is 5 units.', links: [{ target: 'FLOW-PAY', heading: 'Relacionadas' }] }),
    note({ id: 'FLOW-PAY', path: '02-Flows/pay.md', title: 'Payment flow',
           body: 'Payment flow applies the operation limit before charging.', links: [] }),
    note({ id: 'NOISE', path: '01-Concepts/noise.md', title: 'Colors', body: 'Unrelated note about colors.', links: [] }),
  ];
  const graph = buildGraph(notes);

  it('anchors on the best match, pulls in linked notes, and cites sources', () => {
    const r = retrieve(notes, graph, 'what is the operation limit', { maxHits: 5 });
    expect(r.anchors).toContain('RULE-LIMIT');
    const ids = r.hits.map(h => h.id);
    expect(ids).toContain('RULE-LIMIT');
    expect(ids).toContain('FLOW-PAY');          // pulled in via the wikilink
    expect(ids).not.toContain('NOISE');
    const anchorHit = r.hits.find(h => h.id === 'RULE-LIMIT')!;
    expect(anchorHit.via).toBe('anchor');
    expect(anchorHit.excerpt).toContain('limit');
    expect(r.sources).toContain('03-Rules/limit.md');
    expect(r.sources).toContain('FUENTE-rules');
    expect(r.question).toBe('what is the operation limit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- retrieve`
Expected: FAIL — cannot find module `../src/query/retrieve.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/query/retrieve.ts
import { buildIndex, searchIndex } from '../search/index.js';
import { excerpt } from './excerpt.js';
import type { Note, Graph, QueryResult, QueryHit } from '../types.js';

export function retrieve(
  notes: Note[],
  graph: Graph,
  question: string,
  opts: { maxAnchors?: number; hops?: number; maxHits?: number } = {},
): QueryResult {
  const maxAnchors = opts.maxAnchors ?? 5;
  const hops = opts.hops ?? 2;
  const maxHits = opts.maxHits ?? 12;

  const index = buildIndex(notes);
  const ranked = searchIndex(index, question);
  const byId = new Map<string, Note>();
  notes.forEach(n => byId.set(n.id, n));

  const ftsById = new Map<string, number>();
  ranked.forEach(r => ftsById.set(notes[r.index].id, r.score));

  const anchorIds = ranked.slice(0, maxAnchors).map(r => notes[r.index].id);
  const anchorSet = new Set(anchorIds);

  // adjacency (both directions) over the graph's edges
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let s = adj.get(a);
    if (!s) { s = new Set(); adj.set(a, s); }
    s.add(b);
  };
  for (const e of graph.edges) { link(e.from, e.to); link(e.to, e.from); }

  // BFS distance from the anchors, up to `hops`
  const dist = new Map<string, number>();
  anchorIds.forEach(id => dist.set(id, 0));
  let frontier = [...anchorIds];
  for (let d = 1; d <= hops && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!dist.has(nb)) { dist.set(nb, d); next.push(nb); }
      }
    }
    frontier = next;
  }

  const hits: QueryHit[] = [];
  for (const [id, d] of dist) {
    const note = byId.get(id);
    if (!note) continue; // skip dangling/orphan targets — only real notes are citable
    const fts = ftsById.get(id) ?? 0;
    const proximity = (1 / (1 + d)) * (anchorSet.has(id) ? 2 : 0.5);
    hits.push({
      path: note.path,
      id: note.id,
      title: note.title,
      type: note.type,
      score: fts + proximity,
      excerpt: excerpt(note.body, question),
      source: note.source,
      via: anchorSet.has(id) ? 'anchor' : 'link',
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, maxHits);

  const sources = [...new Set(top.flatMap(h => (h.source ? [h.path, h.source] : [h.path])))];
  return { question, anchors: anchorIds, hits: top, sources };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- retrieve`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/query/retrieve.ts toolkit/test/retrieve.test.ts
git commit -m "feat(toolkit): mechanical cited retrieval (anchor + traverse + rank)"
```

---

### Task 5: `query` command + CLI wiring

**Files:**
- Create: `toolkit/src/commands/query.ts`
- Modify: `toolkit/src/cli.ts` (add `query` case + import; update usage string)
- Test: `toolkit/test/query.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `scanVault`, `collectFrontmatterKeys`, `buildGraph`, `retrieve`.
- Produces:
  - `runQuery(vaultDir: string, question: string): QueryResult`.
  - `formatQuery(result: QueryResult): string` — human-readable cited output.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/query.test.ts
import { describe, it, expect } from 'vitest';
import { runQuery, formatQuery } from '../src/commands/query.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-q-'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, '03-Rules', 'limit.md'),
    '---\nid: RULE-LIMIT\ntipo: regla\nfuente: "[[FUENTE-rules]]"\n---\n# Operation limit\nThe applicable limit for an operation of type X is 5 units.');
  return dir;
}

describe('runQuery', () => {
  it('returns a cited result for a question', () => {
    const r = runQuery(vault(), 'operation limit');
    expect(r.hits[0].id).toBe('RULE-LIMIT');
    expect(r.sources).toContain('03-Rules/limit.md');
  });
  it('formatQuery renders the question, a hit, and a Cite line', () => {
    const out = formatQuery(runQuery(vault(), 'operation limit'));
    expect(out).toMatch(/Operation limit/);
    expect(out).toMatch(/Cite:/);
    expect(out).toMatch(/03-Rules\/limit\.md/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- query`
Expected: FAIL — cannot find module `../src/commands/query.js`.

- [ ] **Step 3: Write the `query` command**

```ts
// toolkit/src/commands/query.ts
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { buildGraph } from '../graph.js';
import { retrieve } from '../query/retrieve.js';
import type { QueryResult } from '../types.js';

export function runQuery(vaultDir: string, question: string): QueryResult {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);
  return retrieve(notes, graph, question);
}

export function formatQuery(r: QueryResult): string {
  const lines: string[] = [];
  lines.push(`Q: ${r.question}`);
  lines.push(`Anchors: ${r.anchors.join(', ') || '(none)'}`);
  lines.push('');
  if (r.hits.length === 0) lines.push('(no matching notes)');
  for (const h of r.hits) {
    lines.push(`• [${h.via}] ${h.title}  (${h.path})`);
    if (h.excerpt) lines.push(`    ${h.excerpt}`);
    if (h.source) lines.push(`    source: ${h.source}`);
  }
  lines.push('');
  lines.push(`Cite: ${r.sources.join(' · ') || '(none)'}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Wire it into the CLI**

```ts
// in toolkit/src/cli.ts — add import at top:
import { runQuery, formatQuery } from './commands/query.js';

// add this case inside the switch (before `default`):
    case 'query': {
      const question = argv.slice(1).join(' ').trim();
      if (!question) { console.log('Usage: cortex query <question>'); return 1; }
      console.log(formatQuery(runQuery(cwd, question)));
      return 0;
    }
```

Also update the usage string in the `default` case to include `query`:
```ts
      console.log('Usage: cortex <init|status|orphans|viz|query>');
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- query`
Expected: PASS (2 tests).

- [ ] **Step 6: Full suite + real-vault smoke**

Run: `cd toolkit && npm test` (all green), then `npm run build`.
From a real vault dir: `node "<repo>/toolkit/dist/cli.js" query "what is the applicable limit"`
Expected: prints anchors, a ranked list of cited notes with excerpts, and a `Cite:` line of source paths.

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/commands/query.ts toolkit/src/cli.ts toolkit/test/query.test.ts
git commit -m "feat(toolkit): add cortex query command (mechanical cited retrieval)"
```

---

## Self-Review

**Spec coverage (design §7 retrieval):**
- Anchor (FTS + tag/type weight): Tasks 1–2 (`tokenize`, `buildIndex`/`searchIndex` with title/tags weighting). ✓
- Traverse wikilinks forward+reverse N hops: Task 4 (bidirectional adjacency + BFS). ✓
- Select/rank by relevance + link-proximity, mechanical: Task 4 (`fts + proximity`). ✓
- Cite (every hit → path + source; deduped sources): Task 4 `sources` + Task 5 `Cite:` line. ✓
- Draft step (model): intentionally OUT of the engine — the engine emits cited context; in Claude Code, Claude drafts the answer from it. Documented in Architecture + Global Constraints. ✓
- Structured + full-text, no embeddings; deterministic, local, no API key. ✓ (§7, §11)

**Placeholder scan:** Task 1 Step 5 deliberately replaces the illustrative assertion in Step 2 with the concrete expected output — no TBD remains; every other step has complete code.

**Type consistency:** `QueryHit`/`QueryResult` defined once in `types.ts` (Task 1), imported unchanged by `retrieve.ts` (Task 4) and `query.ts` (Task 5). `SearchIndex` defined in `search/index.ts` (Task 2) and consumed by `retrieve.ts`. `tokenize` (Task 1) used by `index.ts` and `excerpt.ts`. `retrieve(notes, graph, question, opts)`, `runQuery(vaultDir, question)`, `formatQuery(result)` signatures match across producing/consuming tasks.

## Notes for execution

- Tasks 1–4 are pure (no I/O) and fully unit-tested; Task 5 adds the only filesystem path (`runQuery` reads the vault) and is tested against a real temp vault.
- The CLI `query` case reads the question from `argv.slice(1).join(' ')` — `main` receives `process.argv.slice(2)`, so `argv[0]` is `query` and the rest is the question.
- Phase-2.1 follow-ups (out of scope, log them): tag/type/MOC-aware anchor boosting beyond title weight; a `--json` output flag for programmatic use; snippet highlighting; a Claude Code `/query` command/skill that runs `runQuery` and drafts the cited prose answer (the model step) — this is the natural bridge to Phase 4's Claude Code integration.
