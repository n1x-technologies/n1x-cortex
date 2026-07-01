# Cortex `viz` UX Phase 3a — Folder Tree View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Graph | Tree` toggle that switches the `cortex viz` canvas between the wikilink graph and a hierarchical folder tree, reusing Phase 1/2 behavior on the note nodes.

**Architecture:** Client-only. Task 1 is a pure, behavior-preserving refactor: split `render()` into `buildGraphElements()` + a `setView()` that (re)populates the shared Cytoscape instance and runs the layout. Task 2 adds the tree: `buildTreeElements()` synthesizes root/folder/note elements with containment edges, `setView()` gains a tree branch (Cytoscape `breadthfirst`), folder nodes get their own style + guards, and a segmented toggle drives it.

**Tech Stack:** Vanilla browser JS (`app.js` is a plain `<script>`, not an ES module), Cytoscape (vendored), HTML, CSS.

## Global Constraints

- **Files in scope:** ONLY `toolkit/src/viz/static/index.html`, `style.css`, `app.js`. Do not touch `graphData.ts`, `server.ts`, or the `/api/graph` payload.
- **Engine:** Stay on Cytoscape. No new libraries. `app.js` stays a plain browser `<script>` (no import/export).
- **Palette:** navy `#1A1A2E` / coral `#E94560` via existing vars (CSS) or the hex literals already used in the file (Cytoscape stylesheet does not support CSS `var()`). No brand-new colors.
- **`node.folder` is a single top-level segment** (`relPath.split('/')[0]` or `''`) — the tree is one folder level: root → folder → notes; root-level notes (and `exists:false` gaps, whose `folder` is `''`) hang directly off root.
- **Preserve Phase 1/2** on note nodes: focus, highlight (`updateFocus`), in/out panel, Color-by, tri-state filter, search must keep working in both views.
- **Verification is manual QA by design.** No frontend test harness; `app.js` is a non-module browser script. Each implementer's gate is `node --check`; functional/visual verification (Playwright on a built `dist` + human sign-off) is done by the controller. Implementers do NOT run a browser.

## QA harness (controller runs this; implementers do not)

Sample vault at `…/scratchpad/qa-vault` (flat — all notes at root folder `''`, plus a dangling `ghost`). To view built assets:

```bash
cd /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit && npm run build
cd <qa-vault> && node /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/dist/cli.js viz
```

Note: the QA vault is flat, so the tree is root → all notes (depth 1). That still exercises the toggle, tree elements, containment edges, and reuse; deeper nesting is covered by the code path (`folder` non-empty → a folder node), just not visually present in this vault.

---

## Task 1: Refactor `render()` into element-builder + `setView()` (no behavior change)

Factor element construction out of `render()` so a later task can swap element sets. Graph view must look and behave exactly as before.

**Files:**
- Modify: `toolkit/src/viz/static/app.js`

**Interfaces:**
- Produces: `GRAPH_LAYOUT` (const), `buildGraphElements()` → element array (note nodes + wikilink edges), `setView()` → clears the canvas, adds the current view's elements, runs the layout, then `recolor()` + `applyFilter()`. `render()` creates the Cytoscape instance (empty) with the style + handlers, then calls `setView()`. `state.view` (`'graph'|'tree'`) added for Task 2. Task 2 extends `setView` and adds `buildTreeElements`.

- [ ] **Step 1: Add `view` to `state`**

Replace this exact line:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null, hidden: new Set() };
```

with:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null, hidden: new Set(), view: 'graph' };
```

- [ ] **Step 2: Split `render()` into builder + `setView()` + instance setup**

Replace this entire block (the `let cy;` line through the end of `render()`):

```js
let cy;
function render() {
  const nodeIds = new Set(state.data.nodes.map(n => n.id));
  const elements = [];
  for (const n of state.data.nodes) {
    elements.push({ data: { id: n.id, label: n.title, ...n } });
  }
  for (const e of state.data.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
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
      { selector: '.faded', style: { 'opacity': 0.12, 'text-opacity': 0 } },
      { selector: '.spotlight', style: { 'text-opacity': 1 } },
      { selector: '.hidden', style: { 'display': 'none' } },
    ],
  });
  cy.on('tap', 'node', (ev) => { const node = ev.target; focusNode(node); showPanel(node.data()); });
  cy.on('mouseover', 'node', (ev) => { state.hoverNode = ev.target; updateFocus(); });
  cy.on('mouseout', 'node', () => { state.hoverNode = null; updateFocus(); });
  cy.on('select unselect', 'node', () => updateFocus());
  cy.on('tap', (ev) => { if (ev.target === cy) { cy.$(':selected').unselect(); hidePanel(); updateFocus(); } });
}
```

with:

```js
let cy;
const GRAPH_LAYOUT = { name: 'cose', animate: false, nodeRepulsion: 6000, idealEdgeLength: 70 };

function buildGraphElements() {
  const nodeIds = new Set(state.data.nodes.map(n => n.id));
  const elements = [];
  for (const n of state.data.nodes) {
    elements.push({ data: { id: n.id, label: n.title, ...n } });
  }
  for (const e of state.data.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    elements.push({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target, dangling: e.dangling } });
  }
  return elements;
}

function setView() {
  if (!cy) return;
  cy.$(':selected').unselect();
  hidePanel();
  cy.elements().remove();
  cy.add(buildGraphElements());
  cy.layout(GRAPH_LAYOUT).run();
  recolor();
  applyFilter();
}

function render() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: [],
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
      { selector: '.faded', style: { 'opacity': 0.12, 'text-opacity': 0 } },
      { selector: '.spotlight', style: { 'text-opacity': 1 } },
      { selector: '.hidden', style: { 'display': 'none' } },
    ],
  });
  cy.on('tap', 'node', (ev) => { const node = ev.target; focusNode(node); showPanel(node.data()); });
  cy.on('mouseover', 'node', (ev) => { state.hoverNode = ev.target; updateFocus(); });
  cy.on('mouseout', 'node', () => { state.hoverNode = null; updateFocus(); });
  cy.on('select unselect', 'node', () => updateFocus());
  cy.on('tap', (ev) => { if (ev.target === cy) { cy.$(':selected').unselect(); hidePanel(); updateFocus(); } });
  setView();
}
```

- [ ] **Step 3: Syntax gate**

Run: `node --check /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/src/viz/static/app.js`
Expected: clean exit, no output.

- [ ] **Step 4: Self-review**

`git diff`. Confirm: only `app.js` changed; `buildGraphElements` returns exactly the elements the old inline code built; the Cytoscape style array and all five `cy.on(...)` handlers are byte-identical to before; `render()` now inits with `elements: []` and ends by calling `setView()`; `recolor`/`applyFilter` unchanged. No new behavior.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/viz/static/app.js
git commit -m "refactor(viz): split render into buildGraphElements + setView

No behavior change — element construction is factored out of render() so a
later task can swap element sets; setView() clears, adds, lays out, recolors,
and re-applies the filter. render() now creates the instance and calls setView.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification (after this task):** build `dist`, launch, Playwright assert the graph view is unchanged — nodes+wikilink edges render, clicking a node fills `#s-info`, Color-by/filter/search still work, console clean.

---

## Task 2: Tree view + `Graph | Tree` toggle

Add the folder tree and the toggle that switches to it.

**Files:**
- Modify: `toolkit/src/viz/static/index.html` (add `#viewtoggle`)
- Modify: `toolkit/src/viz/static/style.css` (toggle styling)
- Modify: `toolkit/src/viz/static/app.js` (`buildTreeElements`, `TREE_LAYOUT`, `setView` tree branch, folder/tree styles, `isFolder` guards, toggle wiring)

**Interfaces:**
- Consumes: `state.view`, `buildGraphElements`, `setView`, `GRAPH_LAYOUT`, `recolor`, `applyFilter`, `groupKey` (Task 1 / Phase 2).
- Produces: `buildTreeElements()` → synthetic root/folder/note nodes + containment (`tree:true`) edges; `TREE_LAYOUT`. Folder/root nodes carry `isFolder:true`; `groupKey` returns the never-hidden sentinel `'__folder__'` for them.

- [ ] **Step 1: Add the toggle to `index.html`**

In `#s-head`, replace this exact block:

```html
      <section id="s-head">
        <span class="brand">N1X&nbsp;Cortex</span>
        <input id="search" type="search" placeholder="Search notes…" />
      </section>
```

with:

```html
      <section id="s-head">
        <span class="brand">N1X&nbsp;Cortex</span>
        <div id="viewtoggle">
          <button data-view="graph" class="active">Graph</button>
          <button data-view="tree">Tree</button>
        </div>
        <input id="search" type="search" placeholder="Search notes…" />
      </section>
```

- [ ] **Step 2: Toggle styling in `style.css`**

Append to `style.css`:

```css
#viewtoggle { display: flex; gap: 4px; margin-bottom: 8px; }
#viewtoggle button { flex: 1; background: #2a2a40; color: var(--muted); border: 1px solid var(--line);
  border-radius: 6px; padding: 5px 8px; font-size: 12px; cursor: pointer; }
#viewtoggle button.active { background: var(--coral); color: #fff; border-color: var(--coral); }
```

- [ ] **Step 3: `groupKey` sentinel for folder nodes**

Replace this exact block:

```js
function groupKey(n) {
  if (!n.exists) return '__gap__';
```

with:

```js
function groupKey(n) {
  if (n.isFolder) return '__folder__';
  if (!n.exists) return '__gap__';
```

(`'__folder__'` is never in `state.hidden` — the filter rows come from `state.data.nodes`, which have no folder synth nodes — so folder nodes are never hidden by `applyFilter`.)

- [ ] **Step 4: Skip folder nodes in `recolor`**

Replace this exact block:

```js
function recolor() {
  if (!cy) return;
  cy.batch(() => cy.nodes().forEach(n => n.style('background-color', nodeColor(n.data()))));
  buildFilter();
}
```

with:

```js
function recolor() {
  if (!cy) return;
  cy.batch(() => cy.nodes().forEach(n => { if (n.data('isFolder')) return; n.style('background-color', nodeColor(n.data())); }));
  buildFilter();
}
```

- [ ] **Step 5: Add `buildTreeElements()` and `TREE_LAYOUT`**

Immediately after the `buildGraphElements()` function, add:

```js
const TREE_LAYOUT = { name: 'breadthfirst', directed: true, roots: '#__root__', animate: false, spacingFactor: 1.1 };

function buildTreeElements() {
  const elements = [{ data: { id: '__root__', label: 'vault', isFolder: true } }];
  const folders = new Set();
  for (const n of state.data.nodes) {
    const f = n.folder || '';
    if (f && !folders.has(f)) {
      folders.add(f);
      elements.push({ data: { id: `__folder__:${f}`, label: f, isFolder: true } });
      elements.push({ data: { id: `__fedge__:${f}`, source: '__root__', target: `__folder__:${f}`, tree: true } });
    }
  }
  for (const n of state.data.nodes) {
    elements.push({ data: { id: n.id, label: n.title, ...n } });
    const parent = n.folder ? `__folder__:${n.folder}` : '__root__';
    elements.push({ data: { id: `__tedge__:${n.id}`, source: parent, target: n.id, tree: true } });
  }
  return elements;
}
```

- [ ] **Step 6: Teach `setView()` the tree branch**

Replace this exact block:

```js
function setView() {
  if (!cy) return;
  cy.$(':selected').unselect();
  hidePanel();
  cy.elements().remove();
  cy.add(buildGraphElements());
  cy.layout(GRAPH_LAYOUT).run();
  recolor();
  applyFilter();
}
```

with:

```js
function setView() {
  if (!cy) return;
  cy.$(':selected').unselect();
  hidePanel();
  cy.elements().remove();
  cy.add(state.view === 'tree' ? buildTreeElements() : buildGraphElements());
  if (state.view === 'tree') cy.$('[?isFolder]').unselectify();
  cy.layout(state.view === 'tree' ? TREE_LAYOUT : GRAPH_LAYOUT).run();
  recolor();
  applyFilter();
}
```

- [ ] **Step 7: Folder + tree-edge Cytoscape styles, and ignore folder taps**

In `render()`'s style array, replace this exact line:

```js
      { selector: 'edge[?dangling]', style: { 'line-color': '#5a5a70', 'line-style': 'dashed' } },
```

with (adds folder-node and tree-edge styles right after it, before the `.faded` class entry so class states still win):

```js
      { selector: 'edge[?dangling]', style: { 'line-color': '#5a5a70', 'line-style': 'dashed' } },
      { selector: 'node[?isFolder]', style: {
        'shape': 'round-rectangle', 'background-color': '#2a2a40', 'background-opacity': 1,
        'border-width': 1, 'border-color': '#3a3a55', 'border-style': 'solid',
        'width': 'label', 'height': 16, 'padding': '4px',
        'label': 'data(label)', 'font-size': 8, 'color': '#c9c9de', 'text-opacity': 1, 'text-valign': 'center',
      }},
      { selector: 'edge[?tree]', style: { 'width': 1, 'line-color': '#3a3a55', 'curve-style': 'bezier', 'opacity': 0.7, 'target-arrow-shape': 'none' } },
```

Then, in `render()`, replace the node-tap handler:

```js
  cy.on('tap', 'node', (ev) => { const node = ev.target; focusNode(node); showPanel(node.data()); });
```

with (folder/root nodes have no info panel):

```js
  cy.on('tap', 'node', (ev) => { const node = ev.target; if (node.data('isFolder')) return; focusNode(node); showPanel(node.data()); });
```

- [ ] **Step 8: Wire the toggle in `main()`**

In `main()`, immediately after this line:

```js
  document.getElementById('search').addEventListener('input', (e) => applySearch(e.target.value));
```

add:

```js
  document.querySelectorAll('#viewtoggle button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.view === state.view) return;
    state.view = b.dataset.view;
    document.querySelectorAll('#viewtoggle button').forEach(x => x.classList.toggle('active', x.dataset.view === state.view));
    setView();
  }));
```

- [ ] **Step 9: Syntax gate**

Run: `node --check /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/src/viz/static/app.js`
Expected: clean exit, no output.

- [ ] **Step 10: Self-review**

`git diff` on the three files. Confirm: `#viewtoggle` in `#s-head`; toggle CSS present; `groupKey` returns `'__folder__'` for `isFolder`; `recolor` skips folder nodes; `buildTreeElements` synthesizes root + one folder node per non-empty `folder` + note nodes (real ids, `...n`) + `tree:true` containment edges (root→folder, folder→note, root→note for empty folder); `setView` branches on `state.view` and `unselectify`s folders in tree; folder/tree styles added before `.faded`; tap handler ignores `isFolder`; toggle wiring flips `state.view` + `.active` + calls `setView`. No Phase 1/2 note-node logic altered.

- [ ] **Step 11: Commit**

```bash
git add toolkit/src/viz/static/index.html toolkit/src/viz/static/style.css toolkit/src/viz/static/app.js
git commit -m "feat(viz): folder tree view with a Graph|Tree toggle

A segmented toggle switches the canvas to a hierarchical folder tree
(synthetic root -> top-level folder -> notes, containment edges) via
Cytoscape breadthfirst. Note nodes keep their ids so Phase 1/2 (info,
color-by, filter, search, focus) work unchanged; folder nodes are styled
separately, unselectable, and never hidden by the filter.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification (after this task):** build `dist`, launch, Playwright assert: clicking `Tree` sets `state.view==='tree'`, `.active` moves, the canvas has `node[?isFolder]` + `edge[?tree]` and no wikilink edges; clicking a note fills `#s-info`; Color-by colors notes and leaves folders neutral; unchecking a filter group hides those note nodes but never a folder; clicking `Graph` restores the wikilink graph; console clean. Then human visual sign-off.

---

## Final: README + PR

- [ ] **Update the README `cortex viz` line** to mention the Graph/Tree toggle. Current line:
  `Local web viewer: interactive graph in a branded sidebar — search, color-by, animated focus, neighbor highlighting, a bidirectional (in/out) link panel, and a tri-state group filter.`
  Append `, with a Graph/Tree view toggle.` (keep it one line).

```bash
grep -n "cortex viz" /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/README.md
```

- [ ] **Push and open the PR**

```bash
git push -u origin feat/viz-phase3-views
gh pr create --fill
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- View toggle (`Graph|Tree`, `state.view`, rebuild + layout) → Task 1 (`setView`/`state.view`) + Task 2 (toggle UI + wiring). ✅
- Folder tree (synthetic root → top-level folder → notes, containment edges, no wikilinks) → Task 2 `buildTreeElements` + `TREE_LAYOUT`. ✅
- Reuse Phase 1/2 on note nodes (stable ids, info/color/filter/search) → note nodes keep `id` + `...n`; Task 1 refactor preserves handlers; Task 2 only adds folder handling. ✅
- Folder-node styling, unselectable, no-info-panel, never-filtered → Task 2 Steps 3 (`groupKey` sentinel), 6 (`unselectify`), 7 (style + tap guard). ✅
- Edge cases: flat vault (root→notes), gaps under root (`folder:''`), filter re-applied on swap (`setView` calls `applyFilter`), selection cleared on swap (`setView` unselect + `hidePanel`). ✅
- Non-goals (Mermaid, collapse, nested chains, backend) — none introduced. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; verification steps list concrete observations. ✅

**Type consistency:** `buildGraphElements`, `buildTreeElements`, `setView`, `GRAPH_LAYOUT`, `TREE_LAYOUT`, `state.view`, `isFolder`, `tree`, `groupKey`'s `'__folder__'` sentinel, and the `#viewtoggle` ids/`data-view` attributes are named identically across tasks and match the Task 1 refactor and the Task 2 HTML. ✅
