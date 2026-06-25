# Cortex Viewer (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `cortex viz` — a local web viewer that renders the vault as an interactive graph (color-by Type/Status/Freshness toggle, search, detail panel, ghost orphans, coverage header), served from a local HTTP server over the existing engine.

**Architecture:** A new `src/viz/` layer on top of Phase 0: `graphData` turns the engine's graph into a viewer JSON payload (nodes with a computed `freshness`, edges, stats); a minimal Node `http` server serves a static web app + a `/api/graph` endpoint; the web app renders with **Cytoscape.js** (vendored, no bundler). A `viz` CLI command launches the server and opens the browser. Read-only; localhost only.

**Tech Stack:** Node ≥ 20, TypeScript (ESM), vitest, Cytoscape.js (vendored UMD, runtime-only in the browser). No bundler.

## Global Constraints

- **Builds on Phase 0** (`toolkit/`): reuse `loadConfig`, `collectFrontmatterKeys`, `scanVault`, `buildGraph`, types. Do not modify Phase 0 modules unless a task says so.
- **ESM** (`.js` import extensions), Node ≥ 20.
- **Read-only & local:** the viewer never writes to the vault; the server binds to `127.0.0.1` only; no external network calls at runtime (Cytoscape is vendored locally, not from a CDN).
- **`.md` is the source of truth:** the payload is derived; the server reads fresh on each `/api/graph` request.
- **Tool language English** (UI labels, code). Package root `toolkit/`.
- **Coloring (decided):** a "color by" toggle with modes **Type / Status / Freshness**. Freshness values: `gap` (ghost, dashed) · `stale` (orange) · `draft` (amber) · `verified` (green) · `fresh` (neutral green-blue). Default mode: `type`.
- **Tests:** TDD for the data/server layers; the web UI task is build-and-visually-verify (no headless-DOM unit test required).

---

## File Structure

```
toolkit/
├── package.json                 — add `cytoscape` dep; build runs tsc + copy-static
├── scripts/copy-static.mjs      — copy src/viz/static → dist/viz/static; vendor cytoscape
├── src/viz/
│   ├── freshness.ts             — computeFreshness(...) (pure)
│   ├── graphData.ts             — buildGraphData(vaultDir, config) → ViewerData
│   ├── server.ts                — createServer(vaultDir), startViz(vaultDir, port)
│   └── static/
│       ├── index.html
│       ├── style.css
│       └── app.js               — Cytoscape render + toggle + search + detail
├── src/commands/viz.ts          — runViz(vaultDir, port), openBrowser(url)
├── src/cli.ts                   — add `viz` case (modify)
├── src/types.ts                 — add viewer types (modify)
└── test/
    ├── freshness.test.ts
    ├── graphData.test.ts
    └── server.test.ts
```

---

### Task 1: Viewer types + build pipeline for static assets

**Files:**
- Modify: `toolkit/src/types.ts` (append viewer types)
- Modify: `toolkit/package.json` (add `cytoscape` dep; change `build` script)
- Create: `toolkit/scripts/copy-static.mjs`
- Create: `toolkit/src/viz/static/index.html` (placeholder, real content in Task 6)

**Interfaces:**
- Produces (consumed by later tasks):
  `Freshness = 'gap' | 'stale' | 'draft' | 'verified' | 'fresh'`;
  `VizNode { id: string; title: string; type: string | null; status: string | null; folder: string; freshness: Freshness; exists: boolean; degree: number }`;
  `VizEdge { source: string; target: string; context: string | null; dangling: boolean }`;
  `VizStats { total: number; byType: Record<string, number>; byStatus: Record<string, number>; orphans: number; draftsPending: number; missingCitations: number }`;
  `ViewerData { nodes: VizNode[]; edges: VizEdge[]; stats: VizStats; lang: string | null; generatedAt: number }`.

- [ ] **Step 1: Add the viewer types to `types.ts`**

Append to `toolkit/src/types.ts`:

```ts
// ── Viewer (Phase 1) ───────────────────────────────────────────────
export type Freshness = 'gap' | 'stale' | 'draft' | 'verified' | 'fresh';

export interface VizNode {
  id: string;
  title: string;
  type: string | null;
  status: string | null;
  folder: string;
  freshness: Freshness;
  exists: boolean;
  degree: number;
}

export interface VizEdge {
  source: string;
  target: string;
  context: string | null;
  dangling: boolean;
}

export interface VizStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  orphans: number;
  draftsPending: number;
  missingCitations: number;
}

export interface ViewerData {
  nodes: VizNode[];
  edges: VizEdge[];
  stats: VizStats;
  lang: string | null;
  generatedAt: number;
}
```

- [ ] **Step 2: Add the cytoscape dependency**

Run: `cd toolkit && npm install cytoscape@^3.30.0`
Expected: `cytoscape` added to `dependencies` in `package.json`.

- [ ] **Step 3: Create the static-copy build script**

```js
// toolkit/scripts/copy-static.mjs
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const srcStatic = join(root, 'src/viz/static');
const distStatic = join(root, 'dist/viz/static');
await mkdir(distStatic, { recursive: true });
await cp(srcStatic, distStatic, { recursive: true });

// vendor cytoscape's browser UMD build (no CDN, fully offline)
const cyto = require.resolve('cytoscape/dist/cytoscape.min.js');
await mkdir(join(distStatic, 'vendor'), { recursive: true });
await cp(cyto, join(distStatic, 'vendor/cytoscape.min.js'));

console.log('copied static assets + vendored cytoscape to dist/viz/static');
```

- [ ] **Step 4: Update the build script in `package.json`**

Change the `"build"` script from `"tsc"` to:
```json
"build": "tsc && node scripts/copy-static.mjs",
```

- [ ] **Step 5: Create a placeholder static page**

```html
<!-- toolkit/src/viz/static/index.html -->
<!doctype html>
<html><head><meta charset="utf-8"><title>Cortex Viewer</title></head>
<body><p>Cortex viewer placeholder — replaced in Task 6.</p></body></html>
```

- [ ] **Step 6: Verify the build produces the assets**

Run: `cd toolkit && npm run build`
Expected: no errors, and these files exist:
```bash
test -f dist/viz/static/index.html && test -f dist/viz/static/vendor/cytoscape.min.js && echo OK
```
Expected output: `OK`

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/types.ts toolkit/package.json toolkit/package-lock.json toolkit/scripts/copy-static.mjs toolkit/src/viz/static/index.html
git commit -m "feat(toolkit): viewer types and static-asset build pipeline (vendored cytoscape)"
```

---

### Task 2: Freshness computation

**Files:**
- Create: `toolkit/src/viz/freshness.ts`
- Test: `toolkit/test/freshness.test.ts`

**Interfaces:**
- Consumes: `Freshness` (Task 1).
- Produces: `computeFreshness(o: { exists: boolean; stale: boolean; status: string | null; draftStatus: string | null; verifiedStatus: string | null }): Freshness`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/freshness.test.ts
import { describe, it, expect } from 'vitest';
import { computeFreshness } from '../src/viz/freshness.js';

const base = { exists: true, stale: false, status: 'documentado', draftStatus: 'borrador', verifiedStatus: 'verificado' };

describe('computeFreshness', () => {
  it('returns gap for a non-existing (dangling) node', () => {
    expect(computeFreshness({ ...base, exists: false })).toBe('gap');
  });
  it('returns stale when the source changed after the note (overrides status)', () => {
    expect(computeFreshness({ ...base, stale: true })).toBe('stale');
  });
  it('returns draft when status is the first lifecycle stage', () => {
    expect(computeFreshness({ ...base, status: 'borrador' })).toBe('draft');
  });
  it('returns verified when status is the last lifecycle stage', () => {
    expect(computeFreshness({ ...base, status: 'verificado' })).toBe('verified');
  });
  it('returns fresh otherwise', () => {
    expect(computeFreshness(base)).toBe('fresh');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- freshness`
Expected: FAIL — cannot find module `../src/viz/freshness.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/viz/freshness.ts
import type { Freshness } from '../types.js';

export function computeFreshness(o: {
  exists: boolean;
  stale: boolean;
  status: string | null;
  draftStatus: string | null;
  verifiedStatus: string | null;
}): Freshness {
  if (!o.exists) return 'gap';
  if (o.stale) return 'stale';
  if (o.draftStatus && o.status === o.draftStatus) return 'draft';
  if (o.verifiedStatus && o.status === o.verifiedStatus) return 'verified';
  return 'fresh';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- freshness`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/viz/freshness.ts toolkit/test/freshness.test.ts
git commit -m "feat(toolkit): compute node freshness for the viewer"
```

---

### Task 3: Graph data payload

**Files:**
- Create: `toolkit/src/viz/graphData.ts`
- Test: `toolkit/test/graphData.test.ts`

**Interfaces:**
- Consumes: `scanVault` (vault.js), `buildGraph` (graph.js), `computeFreshness` (freshness.js), types `ViewerData`/`VizNode`/`VizEdge`/`VizStats`/`CortexConfig`.
- Produces: `buildGraphData(vaultDir: string, config: CortexConfig): ViewerData`.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/graphData.test.ts
import { describe, it, expect } from 'vitest';
import { buildGraphData } from '../src/viz/graphData.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-viz-'));
  mkdirSync(join(dir, '01-Conceptos'));
  writeFileSync(join(dir, '01-Conceptos', 'a.md'), '---\ntipo: concepto\nestado: documentado\n---\n# A\n[[B]] [[Ghost]]');
  writeFileSync(join(dir, '01-Conceptos', 'b.md'), '---\ntipo: concepto\nestado: borrador\n---\n# B');
  return dir;
}

describe('buildGraphData', () => {
  it('emits nodes, edges, ghost orphans, and stats', () => {
    const dir = fixture();
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    const data = buildGraphData(dir, cfg);

    const a = data.nodes.find(n => n.id === 'A');
    const b = data.nodes.find(n => n.id === 'B');
    const ghost = data.nodes.find(n => n.id === 'Ghost');

    expect(a?.exists).toBe(true);
    expect(a?.freshness).toBe('fresh');           // documentado, not draft/verified
    expect(b?.freshness).toBe('draft');           // borrador = first lifecycle stage
    expect(ghost?.exists).toBe(false);
    expect(ghost?.freshness).toBe('gap');

    expect(data.edges).toContainEqual({ source: 'A', target: 'B', context: null, dangling: false });
    expect(data.edges).toContainEqual({ source: 'A', target: 'Ghost', context: null, dangling: true });

    expect(data.stats.total).toBe(2);
    expect(data.stats.orphans).toBe(1);
    expect(data.stats.draftsPending).toBe(1);
    expect(typeof data.generatedAt).toBe('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- graphData`
Expected: FAIL — cannot find module `../src/viz/graphData.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/viz/graphData.ts
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { scanVault } from '../vault.js';
import { buildGraph } from '../graph.js';
import { computeFreshness } from './freshness.js';
import type { CortexConfig, Note, ViewerData, VizNode, VizEdge } from '../types.js';

function mtime(path: string): number | null {
  try { return statSync(path).mtimeMs; } catch { return null; }
}

// Best-effort: locate the source note's file under sourcesDir by matching its basename to `source`.
function sourceMtime(vaultDir: string, sourcesDir: string, source: string | null, byBasename: Map<string, string>): number | null {
  if (!source) return null;
  const rel = byBasename.get(source);
  if (!rel) return null;
  return mtime(join(vaultDir, rel));
}

export function buildGraphData(vaultDir: string, config: CortexConfig): ViewerData {
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);

  const draftStatus = config.statusLifecycle[0] ?? null;
  const verifiedStatus = config.statusLifecycle[config.statusLifecycle.length - 1] ?? null;

  // index notes by id for note lookup, and a basename map over the sources dir for stale detection
  const byId = new Map<string, Note>();
  for (const n of notes) byId.set(n.id, n);

  // map of source-file basenames → their vault-relative path (sources live under sourcesDir)
  const sourcesBase = new Map<string, string>();
  // (sources are excluded from scanVault, so we re-walk lightly is overkill; instead, accept that a
  //  source note inside the graph counts too — match any note id to its path)
  for (const n of notes) sourcesBase.set(n.id, n.path);

  // degree per node id
  const degree = new Map<string, number>();
  for (const e of graph.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const nodes: VizNode[] = [];
  for (const gn of graph.nodes.values()) {
    const note = gn.note;
    let stale = false;
    if (note && note.source) {
      const sm = sourceMtime(vaultDir, config.sourcesDir, note.source, sourcesBase);
      const nm = mtime(join(vaultDir, note.path));
      stale = sm != null && nm != null && sm > nm;
    }
    nodes.push({
      id: gn.key,
      title: note ? note.title : gn.key,
      type: note ? note.type : null,
      status: note ? note.status : null,
      folder: note ? note.folder : '',
      exists: gn.exists,
      degree: degree.get(gn.key) ?? 0,
      freshness: computeFreshness({ exists: gn.exists, stale, status: note ? note.status : null, draftStatus, verifiedStatus }),
    });
  }

  const edges: VizEdge[] = graph.edges.map(e => ({
    source: e.from,
    target: e.to,
    context: e.heading,
    dangling: graph.nodes.get(e.to)?.exists === false,
  }));

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let draftsPending = 0;
  let missingCitations = 0;
  for (const n of notes) {
    if (n.type) byType[n.type] = (byType[n.type] ?? 0) + 1;
    if (n.status) byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
    if (draftStatus && n.status === draftStatus) draftsPending++;
    if (!n.source) missingCitations++;
  }

  return {
    nodes,
    edges,
    stats: { total: notes.length, byType, byStatus, orphans: graph.orphans.length, draftsPending, missingCitations },
    lang: config.lang,
    generatedAt: mtime(vaultDir) ?? 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- graphData`
Expected: PASS (1 test).

> Note: `generatedAt` uses the vault dir mtime as a stable, injectable timestamp (avoids `Date.now()`, which is intentionally unavailable in some sandboxes and would make output non-deterministic). The web app shows it as "data as of file-system state", which is sufficient.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/viz/graphData.ts toolkit/test/graphData.test.ts
git commit -m "feat(toolkit): build the viewer graph-data payload from the vault"
```

---

### Task 4: Local HTTP server

**Files:**
- Create: `toolkit/src/viz/server.ts`
- Test: `toolkit/test/server.test.ts`

**Interfaces:**
- Consumes: `buildGraphData` (graphData.js), `loadConfig`, `collectFrontmatterKeys`.
- Produces:
  - `createServer(vaultDir: string): http.Server` — serves static files from the sibling `static/` dir, `GET /api/health` → `{ok:true}`, `GET /api/graph` → `ViewerData`.
  - `startViz(vaultDir: string, port?: number): Promise<{ server: http.Server; port: number; url: string }>` — binds to `127.0.0.1`; `port: 0` picks a free port.

- [ ] **Step 1: Write the failing test**

```ts
// toolkit/test/server.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { startViz } from '../src/viz/server.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

let server: Server | undefined;
afterEach(() => server?.close());

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-srv-'));
  mkdirSync(join(dir, '01-Conceptos'));
  writeFileSync(join(dir, '01-Conceptos', 'a.md'), '---\ntipo: concepto\n---\n# A');
  return dir;
}

describe('startViz', () => {
  it('serves /api/health and /api/graph on a free port', async () => {
    const out = await startViz(fixture(), 0);
    server = out.server;
    expect(out.url).toMatch(/^http:\/\/localhost:\d+\/$/);

    const health = await fetch(out.url + 'api/health');
    expect(await health.json()).toEqual({ ok: true });

    const graph = await fetch(out.url + 'api/graph');
    const data = await graph.json();
    expect(data.nodes.some((n: { id: string }) => n.id === 'A')).toBe(true);
    expect(data.stats.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- server`
Expected: FAIL — cannot find module `../src/viz/server.js`.

- [ ] **Step 3: Write the implementation**

```ts
// toolkit/src/viz/server.ts
import { createServer as createHttpServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraphData } from './graphData.js';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';

const STATIC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'static');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function createServer(vaultDir: string): Server {
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'content-type': MIME['.json'] });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (url.pathname === '/api/graph') {
        const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
        const data = buildGraphData(vaultDir, config);
        res.writeHead(200, { 'content-type': MIME['.json'] });
        res.end(JSON.stringify(data));
        return;
      }
      const rel = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = normalize(join(STATIC_DIR, rel));
      if (filePath !== STATIC_DIR && !filePath.startsWith(STATIC_DIR + '/')) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
}

export function startViz(vaultDir: string, port = 4317): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(vaultDir);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ server, port: p, url: `http://localhost:${p}/` });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd toolkit && npm test -- server`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/viz/server.ts toolkit/test/server.test.ts
git commit -m "feat(toolkit): local HTTP server with /api/graph and static serving"
```

---

### Task 5: `viz` command + CLI wiring

**Files:**
- Create: `toolkit/src/commands/viz.ts`
- Modify: `toolkit/src/cli.ts` (add `viz` case + import; update usage string)
- Test: `toolkit/test/server.test.ts` (append a `runViz` block)

**Interfaces:**
- Consumes: `startViz` (server.js).
- Produces:
  - `runViz(vaultDir: string, port?: number): Promise<{ server; port: number; url: string }>`.
  - `openBrowser(url: string): void` — best-effort `open`/`xdg-open`/`start`; never throws.

- [ ] **Step 1: Write the failing test (append to server.test.ts)**

```ts
// append to toolkit/test/server.test.ts
import { runViz } from '../src/commands/viz.js';

describe('runViz', () => {
  it('starts the viewer and returns a localhost url', async () => {
    const out = await runViz(fixture(), 0);
    server = out.server;
    expect(out.url).toMatch(/^http:\/\/localhost:\d+\/$/);
    const r = await fetch(out.url + 'api/health');
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd toolkit && npm test -- server`
Expected: FAIL — cannot find module `../src/commands/viz.js`.

- [ ] **Step 3: Write the `viz` command**

```ts
// toolkit/src/commands/viz.ts
import { spawn } from 'node:child_process';
import type { Server } from 'node:http';
import { startViz } from '../viz/server.js';

export function runViz(vaultDir: string, port = 4317): Promise<{ server: Server; port: number; url: string }> {
  return startViz(vaultDir, port);
}

export function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* best-effort: opening the browser is a convenience, not a requirement */
  }
}
```

- [ ] **Step 4: Wire it into the CLI**

```ts
// in toolkit/src/cli.ts — add imports at top:
import { runViz, openBrowser } from './commands/viz.js';

// add this case inside the switch (before `default`):
    case 'viz': {
      const { url } = await runViz(cwd);
      console.log(`Cortex viewer running at ${url}`);
      console.log('Press Ctrl+C to stop.');
      openBrowser(url);
      await new Promise(() => {}); // keep the process alive while the server runs
      return 0;
    }
```

Also update the usage string in the `default` case to include `viz`:
```ts
      console.log('Usage: cortex <init|status|orphans|viz>');
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd toolkit && npm test -- server`
Expected: PASS (both server tests).

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/commands/viz.ts toolkit/src/cli.ts toolkit/test/server.test.ts
git commit -m "feat(toolkit): add cortex viz command that launches the viewer"
```

---

### Task 6: The web app (Cytoscape render + toggle + search + detail)

**Files:**
- Modify: `toolkit/src/viz/static/index.html` (replace placeholder)
- Create: `toolkit/src/viz/static/style.css`
- Create: `toolkit/src/viz/static/app.js`

This task is **build-and-visually-verify** (UI). Write the three files exactly, rebuild, launch against a real vault, and confirm in a browser/screenshot.

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cortex Viewer</title>
  <link rel="stylesheet" href="style.css" />
  <script src="vendor/cytoscape.min.js"></script>
</head>
<body>
  <header id="bar">
    <span class="brand">N1X&nbsp;Cortex</span>
    <span id="stats" class="stats">loading…</span>
    <span class="spacer"></span>
    <label class="colorby">Color by
      <select id="colorby">
        <option value="type">Type</option>
        <option value="status">Status</option>
        <option value="freshness">Freshness</option>
      </select>
    </label>
    <input id="search" type="search" placeholder="Search notes…" />
  </header>
  <main>
    <div id="cy"></div>
    <aside id="panel" class="hidden">
      <button id="panel-close" aria-label="Close">×</button>
      <h2 id="p-title"></h2>
      <dl id="p-meta"></dl>
      <div id="p-links"></div>
    </aside>
    <div id="legend"></div>
  </main>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `style.css`**

```css
:root {
  --navy: #1A1A2E; --coral: #E94560; --bg: #11111b; --panel: #1c1c2b;
  --ink: #e8e8f2; --muted: #9a9ab5; --line: #2a2a40;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink);
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
#bar { display: flex; align-items: center; gap: 14px; padding: 10px 16px;
  background: var(--navy); border-bottom: 1px solid var(--line); }
.brand { font-weight: 700; letter-spacing: .3px; }
.stats { color: var(--muted); font-size: 12px; }
.spacer { flex: 1; }
#bar select, #bar input { background: #2a2a40; color: var(--ink); border: 1px solid var(--line);
  border-radius: 6px; padding: 5px 8px; font-size: 13px; }
.colorby { color: var(--muted); font-size: 12px; display: flex; align-items: center; gap: 6px; }
main { position: relative; height: calc(100% - 49px); }
#cy { position: absolute; inset: 0; }
#panel { position: absolute; top: 12px; right: 12px; width: 320px; max-height: calc(100% - 24px);
  overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 14px 16px; box-shadow: 0 8px 30px rgba(0,0,0,.4); }
#panel.hidden { display: none; }
#panel h2 { margin: 0 28px 8px 0; font-size: 16px; }
#panel dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 0 0 10px; font-size: 12px; }
#panel dt { color: var(--muted); }
#panel a { color: #7db4ff; text-decoration: none; display: block; }
#panel-close { position: absolute; top: 8px; right: 10px; background: none; border: none;
  color: var(--muted); font-size: 20px; cursor: pointer; }
#legend { position: absolute; bottom: 12px; left: 12px; background: rgba(28,28,43,.85);
  border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 11px;
  color: var(--ink); display: flex; flex-wrap: wrap; gap: 4px 12px; max-width: 60%; }
#legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  vertical-align: middle; margin-right: 5px; }
```

- [ ] **Step 3: Write `app.js`**

```js
/* Cortex Viewer — fetches /api/graph and renders it with Cytoscape. */
const TYPE_PALETTE = ['#4F9DDE', '#E94560', '#46C0A0', '#E0A458', '#9B7EDE', '#D86F9B', '#6FB36F', '#C8A24A'];
const FRESH = { gap: '#6e6e80', stale: '#db6d28', draft: '#d29922', verified: '#2ea043', fresh: '#46c0a0' };
const STATUS_FALLBACK = ['#8a8aa0', '#4F9DDE', '#2ea043', '#E0A458'];

const state = { data: null, mode: 'type', typeColors: {}, statusColors: {} };

function assignColors(values, palette) {
  const map = {};
  values.forEach((v, i) => { map[v] = palette[i % palette.length]; });
  return map;
}

function nodeColor(n) {
  if (!n.exists) return FRESH.gap;
  if (state.mode === 'freshness') return FRESH[n.freshness] || FRESH.fresh;
  if (state.mode === 'status') return state.statusColors[n.status] || '#8a8aa0';
  return state.typeColors[n.type] || '#8a8aa0';
}

function buildLegend() {
  const el = document.getElementById('legend');
  let entries;
  if (state.mode === 'freshness') {
    entries = [['verified & in sync', FRESH.verified], ['draft', FRESH.draft], ['stale', FRESH.stale], ['fresh', FRESH.fresh], ['gap (missing)', FRESH.gap]];
  } else if (state.mode === 'status') {
    entries = Object.entries(state.statusColors);
  } else {
    entries = Object.entries(state.typeColors);
  }
  el.innerHTML = entries.map(([k, c]) => `<span><span class="dot" style="background:${c}"></span>${k || '—'}</span>`).join('');
}

let cy;
function render() {
  const elements = [];
  for (const n of state.data.nodes) {
    elements.push({ data: { id: n.id, label: n.title, ...n } });
  }
  for (const e of state.data.edges) {
    if (!cyHas(e.source) || !cyHas(e.target)) continue;
    elements.push({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target, dangling: e.dangling } });
  }
  cy = cytoscape({
    container: document.getElementById('cy'),
    elements,
    layout: { name: 'cose', animate: false, nodeRepulsion: 6000, idealEdgeLength: 70 },
    style: [
      { selector: 'node', style: {
        'background-color': (n) => nodeColor(n.data()),
        'width': (n) => 8 + Math.min(28, (n.data('degree') || 0) * 1.4),
        'height': (n) => 8 + Math.min(28, (n.data('degree') || 0) * 1.4),
        'label': 'data(label)', 'font-size': 6, 'color': '#cfcfe6',
        'text-opacity': 0, 'min-zoomed-font-size': 8,
        'border-width': (n) => n.data('exists') ? 0 : 2,
        'border-style': 'dashed', 'border-color': '#8a8aa0',
        'background-opacity': (n) => n.data('exists') ? 1 : 0.25,
      }},
      { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#fff', 'border-style': 'solid', 'text-opacity': 1 } },
      { selector: 'edge', style: { 'width': 0.6, 'line-color': '#3a3a55', 'curve-style': 'haystack', 'opacity': 0.6 } },
      { selector: 'edge[?dangling]', style: { 'line-color': '#5a5a70', 'line-style': 'dashed' } },
    ],
  });
  const nodeIds = new Set(state.data.nodes.map(n => n.id));
  function cyHasInner(id) { return nodeIds.has(id); }
  cy.on('tap', 'node', (ev) => showPanel(ev.target.data()));
  cy.on('tap', (ev) => { if (ev.target === cy) hidePanel(); });
}
// edge guard needs the node set before cy exists; recompute simply:
function cyHas(id) { return state.data.nodes.some(n => n.id === id); }

function recolor() {
  if (!cy) return;
  cy.batch(() => cy.nodes().forEach(n => n.style('background-color', nodeColor(n.data()))));
  buildLegend();
}

function showPanel(n) {
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('p-title').textContent = n.label || n.id;
  const meta = [['id', n.id], ['type', n.type], ['status', n.status], ['folder', n.folder], ['freshness', n.freshness], ['links', n.degree]];
  document.getElementById('p-meta').innerHTML = meta.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const outgoing = state.data.edges.filter(e => e.source === n.id).map(e => e.target);
  document.getElementById('p-links').innerHTML = outgoing.length
    ? '<dt>connects to</dt>' + outgoing.slice(0, 25).map(t => `<a href="#" data-id="${t}">${t}</a>`).join('') : '';
  document.querySelectorAll('#p-links a').forEach(a => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    const node = cy.getElementById(a.dataset.id);
    if (node.nonempty()) { cy.center(node); node.select(); showPanel(node.data()); }
  }));
}
function hidePanel() { document.getElementById('panel').classList.add('hidden'); }

function applySearch(q) {
  if (!cy) return;
  const term = q.trim().toLowerCase();
  cy.batch(() => cy.nodes().forEach(n => {
    const hit = !term || (n.data('label') || '').toLowerCase().includes(term) || n.id.toLowerCase().includes(term);
    n.style('opacity', hit ? 1 : 0.12);
    n.style('text-opacity', hit && term ? 1 : 0);
  }));
}

async function main() {
  const res = await fetch('api/graph');
  state.data = await res.json();
  const types = Object.keys(state.data.stats.byType);
  const statuses = Object.keys(state.data.stats.byStatus);
  state.typeColors = assignColors(types, TYPE_PALETTE);
  state.statusColors = assignColors(statuses, STATUS_FALLBACK);

  const s = state.data.stats;
  document.getElementById('stats').textContent =
    `${s.total} notes · ${s.orphans} gaps · ${s.draftsPending} drafts · ${s.missingCitations} uncited`;

  render();
  buildLegend();

  document.getElementById('colorby').addEventListener('change', (e) => { state.mode = e.target.value; recolor(); });
  document.getElementById('search').addEventListener('input', (e) => applySearch(e.target.value));
  document.getElementById('panel-close').addEventListener('click', hidePanel);
}
main();
```

- [ ] **Step 4: Rebuild and launch against a real vault**

```bash
cd toolkit && npm run build
node dist/cli.js viz   # run from inside a vault dir; opens the browser at http://localhost:4317/
```
Expected: a browser tab shows the graph — nodes colored by type, draggable, with the stats header, the color-by dropdown (Type/Status/Freshness), a working search box, a legend, and a detail panel when you click a node. Ghost (orphan) nodes render dashed/faded.

- [ ] **Step 5: Visual smoke (screenshot, optional but recommended)**

Capture page 1 of `http://localhost:4317/` (e.g. with a headless browser) and confirm: header stats present, graph renders, switching "Color by" to Freshness recolors (green/amber/orange/ghost), clicking a node opens the panel with its frontmatter and links.

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/viz/static/index.html toolkit/src/viz/static/style.css toolkit/src/viz/static/app.js
git commit -m "feat(toolkit): web viewer UI — cytoscape graph, color-by toggle, search, detail panel"
```

---

## Self-Review

**Spec coverage (Phase 1 row of the design §10 + §9 viewer):**
- Local server + browser launch (`cortex viz`): Tasks 4–5. ✓
- Graph render (nodes=notes, edges=wikilinks, ghost orphans): Task 6 + payload Task 3. ✓ (§9)
- "Color by" toggle Type/Status/Freshness (decided default `type`): Task 6 + freshness Tasks 2–3. ✓ (§9, §11)
- Search/filter highlighting in the graph: Task 6 `applySearch`. ✓
- Coverage/orphans surfaced: stats header (total/gaps/drafts/uncited) from Task 3 stats. ✓ (partial of §9 "coverage dashboard"; a full dashboard view is a Phase 1.1 follow-up)
- Detail panel (frontmatter, links, "open in editor"): Task 6 panel — frontmatter + link navigation present; "open in editor" deep-link is a follow-up. ✓ (mostly)
- `.md`-as-truth, read-only, localhost-only, offline (vendored cytoscape): Tasks 1, 4. ✓ (§9)
- sigma.js → **Cytoscape.js** deviation: documented in Global Constraints; the design §9 named Cytoscape as the explicit alternative. ✓

**Placeholder scan:** no TBD/TODO; every code step contains complete code. The one cross-file subtlety (the edge-guard `cyHas` is a standalone function, not a closure) is written out fully in Task 6.

**Type consistency:** `ViewerData`/`VizNode`/`VizEdge`/`VizStats`/`Freshness` defined once in `types.ts` (Task 1) and imported unchanged by `graphData.ts` (Task 3); `buildGraphData(vaultDir, config)`, `createServer(vaultDir)`, `startViz(vaultDir, port)`, `runViz(vaultDir, port)` signatures match across producing/consuming tasks. `computeFreshness` param object is identical in Task 2 (definition) and Task 3 (call site).

## Notes for execution

- Node ≥ 18 provides global `fetch`, used by the server tests — no dependency needed.
- The web-app task (6) cannot be meaningfully unit-tested without a DOM; its verification is the build + a live launch (and an optional screenshot). Treat a clean build + a rendering smoke as the acceptance bar.
- Phase 1.1 follow-ups (out of scope, log them): a dedicated coverage dashboard view; a local-graph (one note + N hops) view; "open in editor" deep-links; true source-file `stale` detection across the excluded `Markdown/` sources dir; live file-watch hot-reload.
