# Cortex `viz` UX Phase 4 — Live Force Controls (d3-force) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `cortex viz` graph feel alive like Obsidian — a continuous `cytoscape-d3-force` simulation with subtle perpetual motion, four sliders that reshape the physics live, and node dragging that releases.

**Architecture:** Two tasks. Task 1 vendors `d3-force` + `cytoscape-d3-force` offline (like the existing `cytoscape.min.js`) and loads them in the page. Task 2 swaps the graph layout from one-shot `cose` to a managed continuous `d3-force` simulation (`startSim`/`stopSim` around a `graphSim` instance), maps the four sliders to d3 forces live, and falls back to static `cose` if the extension is absent.

**Tech Stack:** Vanilla browser JS (`app.js` is a plain `<script>`, not an ES module), Cytoscape + `cytoscape-d3-force` (vendored), HTML, CSS, Node build script.

## Global Constraints

- **Files in scope:** `toolkit/src/viz/static/{index.html,app.js}`, `toolkit/scripts/copy-static.mjs`, `toolkit/package.json` (+ lockfile). `style.css` is unchanged (Forces styling already present). Do not touch `graphData.ts`, `server.ts`, `/api/graph`.
- **Vendoring, not runtime deps:** `cytoscape-d3-force@^1.1.4` and `d3-force@^3` are **devDependencies** copied into `dist/viz/static/vendor/`. They must NOT become runtime `dependencies` — the shipped `@n1x-technologies/cortex` dependency tree stays unchanged.
- **Engine:** Cytoscape + the d3-force extension. No other new libraries. `app.js` stays a plain browser `<script>` (no import/export).
- **Palette:** unchanged; no color work in this phase.
- **Continuous + subtle + drag-releases:** graph uses `{ name:'d3-force', animate:true, infinite:true, fixedAfterDragging:false, alphaTarget: AMBIENT_ALPHA, velocityDecay:0.4 }`. `AMBIENT_ALPHA = 0.02` (tunable). Tree view stays `breadthfirst`; forces are graph-only and the sim is stopped in tree.
- **Slider → force mapping (step-aligned):** Centre `centre`→`xStrength`&`yStrength` (0.1; 0–1/0.05); Repel `repel`→`manyBodyStrength = -repel` (300; 0–1000/25); Link force `link`→`linkStrength` (0.5; 0–1/0.05); Link distance `distance`→`linkDistance` (40; 10–300/5). Slider `data-force` = the `state.forces` key.
- **Verification is manual QA by design.** No frontend test harness; `app.js` is a non-module browser script. Task 1's gate is a real build check (vendor files exist); Task 2's gate is `node --check`; functional/visual verification (Playwright on a built `dist` + human sign-off) is done by the controller.

## QA harness (controller runs this)

```bash
cd /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit && npm run build
cd <qa-vault> && node /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/dist/cli.js viz
```

---

## Task 1: Vendor d3-force + cytoscape-d3-force (deps, build, page load)

**Files:**
- Modify: `toolkit/package.json` (+ `package-lock.json` via install)
- Modify: `toolkit/scripts/copy-static.mjs`
- Modify: `toolkit/src/viz/static/index.html` (head scripts + shim)

**Interfaces:**
- Produces: browser globals `window.d3` (from `d3-force`), `window['d3-force']` (shim alias), and `window.cytoscapeD3Force` (the extension), all loaded before `app.js`. `dist/viz/static/vendor/` gains `d3-force.min.js` and `cytoscape-d3-force.js`. Task 2 consumes `window.cytoscapeD3Force`.

- [ ] **Step 1: Install the vendored engine as devDependencies**

Run (from `toolkit/`):

```bash
npm install --save-dev cytoscape-d3-force@^1.1.4 d3-force@^3
```

Confirm they landed under `devDependencies` (NOT `dependencies`) in `toolkit/package.json`. If npm placed them in `dependencies`, move them to `devDependencies`.

- [ ] **Step 2: Vendor both UMD files in `copy-static.mjs`**

In `toolkit/scripts/copy-static.mjs`, replace this block:

```js
// vendor cytoscape's browser UMD build (no CDN, fully offline)
const cyto = require.resolve('cytoscape/dist/cytoscape.min.js');
await mkdir(join(distStatic, 'vendor'), { recursive: true });
await cp(cyto, join(distStatic, 'vendor/cytoscape.min.js'));

console.log('copied static assets + vendored cytoscape to dist/viz/static');
```

with:

```js
// vendor cytoscape + the d3-force physics extension (no CDN, fully offline)
const vendorDir = join(distStatic, 'vendor');
await mkdir(vendorDir, { recursive: true });
await cp(require.resolve('cytoscape/dist/cytoscape.min.js'), join(vendorDir, 'cytoscape.min.js'));
await cp(require.resolve('d3-force/dist/d3-force.min.js'), join(vendorDir, 'd3-force.min.js'));
await cp(require.resolve('cytoscape-d3-force/cytoscape-d3-force.js'), join(vendorDir, 'cytoscape-d3-force.js'));

console.log('copied static assets + vendored cytoscape + d3-force to dist/viz/static');
```

- [ ] **Step 3: Load the scripts + shim in `index.html`**

In `toolkit/src/viz/static/index.html`, replace this line:

```html
  <script src="vendor/cytoscape.min.js"></script>
```

with (order matters; the shim bridges the global-name mismatch — `d3-force`'s UMD exposes `d3`, the extension's UMD reads `d3-force`):

```html
  <script src="vendor/cytoscape.min.js"></script>
  <script src="vendor/d3-force.min.js"></script>
  <script>window['d3-force'] = window.d3;</script>
  <script src="vendor/cytoscape-d3-force.js"></script>
```

- [ ] **Step 4: Build and verify the vendor files exist**

Run (from `toolkit/`):

```bash
npm run build && ls dist/viz/static/vendor/
```

Expected: the listing includes `cytoscape.min.js`, `d3-force.min.js`, and `cytoscape-d3-force.js`, and the build prints `...vendored cytoscape + d3-force...`.

- [ ] **Step 5: Commit**

```bash
git add toolkit/package.json toolkit/package-lock.json toolkit/scripts/copy-static.mjs toolkit/src/viz/static/index.html
git commit -m "build(viz): vendor d3-force + cytoscape-d3-force offline

Adds the physics extension and d3-force as devDependencies, copies their UMD
builds into dist/viz/static/vendor/ alongside cytoscape.min.js, and loads them
in index.html with a window['d3-force']=d3 shim (the extension's UMD reads the
d3-force global under that name). No runtime dependency change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification (after this task):** build, launch, Playwright assert `window.cytoscapeD3Force` and `window.d3` and `window['d3-force']` are all defined and console is clean (no 404 for the vendor files). No behavior change yet (graph still uses the current cose `graphLayout`).

---

## Task 2: Continuous d3-force graph + live sliders + drag-release

**Files:**
- Modify: `toolkit/src/viz/static/index.html` (slider ranges/defaults)
- Modify: `toolkit/src/viz/static/app.js` (register extension, new `state.forces`, d3-force `graphLayout`, `startSim`/`stopSim`, `setView`, `relayout`, cose fallback)

**Interfaces:**
- Consumes: `window.cytoscapeD3Force` (Task 1), `setView`/`buildGraphElements`/`buildTreeElements`/`TREE_LAYOUT`/`recolor`/`applyFilter` (Phase 3a).
- Produces: `AMBIENT_ALPHA`, `d3ForceOk` (bool), `graphLayout()` (d3-force opts or cose fallback), `graphSim` (running layout or null), `startSim()`/`stopSim()`, debounced `relayout()`.

- [ ] **Step 1: Update the slider ranges/defaults in `index.html`**

Replace this exact block:

```html
          <label class="force">Centre force<input type="range" data-force="gravity" min="0" max="4" step="0.1" value="1"></label>
          <label class="force">Repel force<input type="range" data-force="nodeRepulsion" min="1000" max="20000" step="500" value="6000"></label>
          <label class="force">Link force<input type="range" data-force="edgeElasticity" min="0" max="400" step="4" value="32"></label>
          <label class="force">Link distance<input type="range" data-force="idealEdgeLength" min="20" max="300" step="5" value="70"></label>
```

with:

```html
          <label class="force">Centre force<input type="range" data-force="centre" min="0" max="1" step="0.05" value="0.1"></label>
          <label class="force">Repel force<input type="range" data-force="repel" min="0" max="1000" step="25" value="300"></label>
          <label class="force">Link force<input type="range" data-force="link" min="0" max="1" step="0.05" value="0.5"></label>
          <label class="force">Link distance<input type="range" data-force="distance" min="10" max="300" step="5" value="40"></label>
```

- [ ] **Step 2: Replace the `state.forces` shape in `app.js`**

Replace this exact line:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null, hidden: new Set(), view: 'graph', forces: { gravity: 1, nodeRepulsion: 6000, edgeElasticity: 32, idealEdgeLength: 70 } };
```

with:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null, hidden: new Set(), view: 'graph', forces: { centre: 0.1, repel: 300, link: 0.5, distance: 40 } };
```

- [ ] **Step 3: Register the extension + replace `graphLayout()`/`relayout()` with the sim engine**

Replace this exact block:

```js
let cy;
function graphLayout() {
  return { name: 'cose', animate: false,
    gravity: state.forces.gravity,
    nodeRepulsion: state.forces.nodeRepulsion,
    edgeElasticity: state.forces.edgeElasticity,
    idealEdgeLength: state.forces.idealEdgeLength };
}

let relayoutTimer;
function relayout() {
  if (!cy || state.view !== 'graph') return;
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => cy.layout(graphLayout()).run(), 200);
}
```

with:

```js
let cy;
const AMBIENT_ALPHA = 0.02; // subtle perpetual motion; tunable

let d3ForceOk = false;
try {
  if (window.cytoscapeD3Force) { cytoscape.use(window.cytoscapeD3Force); d3ForceOk = true; }
} catch (e) { d3ForceOk = false; } // already-registered or missing: fall back to static cose

function graphLayout() {
  if (!d3ForceOk) {
    return { name: 'cose', animate: false, nodeRepulsion: 6000, idealEdgeLength: 70 };
  }
  return {
    name: 'd3-force', animate: true, infinite: true, fixedAfterDragging: false,
    linkId: (d) => d.id,
    linkDistance: state.forces.distance,
    linkStrength: state.forces.link,
    manyBodyStrength: -state.forces.repel,
    xStrength: state.forces.centre,
    yStrength: state.forces.centre,
    alphaTarget: AMBIENT_ALPHA, velocityDecay: 0.4,
  };
}

let graphSim = null;
function stopSim() { if (graphSim) { graphSim.stop(); graphSim = null; } }
function startSim() {
  if (!cy || state.view !== 'graph') return;
  stopSim();
  graphSim = cy.layout(graphLayout());
  graphSim.run();
}

let relayoutTimer;
function relayout() {
  if (state.view !== 'graph') return;
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(startSim, 120);
}
```

- [ ] **Step 4: Route `setView()` through `startSim`/`stopSim`**

Replace this exact function:

```js
function setView() {
  if (!cy) return;
  document.getElementById('s-forces').style.display = state.view === 'graph' ? '' : 'none';
  cy.$(':selected').unselect();
  hidePanel();
  cy.elements().remove();
  cy.add(state.view === 'tree' ? buildTreeElements() : buildGraphElements());
  if (state.view === 'tree') cy.$('[?isFolder]').unselectify();
  cy.layout(state.view === 'tree' ? TREE_LAYOUT : graphLayout()).run();
  recolor();
  applyFilter();
}
```

with:

```js
function setView() {
  if (!cy) return;
  document.getElementById('s-forces').style.display = state.view === 'graph' ? '' : 'none';
  cy.$(':selected').unselect();
  hidePanel();
  stopSim();
  cy.elements().remove();
  cy.add(state.view === 'tree' ? buildTreeElements() : buildGraphElements());
  if (state.view === 'tree') { cy.$('[?isFolder]').unselectify(); cy.layout(TREE_LAYOUT).run(); }
  else { startSim(); }
  recolor();
  applyFilter();
}
```

- [ ] **Step 5: Syntax gate**

Run: `node --check /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/src/viz/static/app.js`
Expected: clean exit, no output.

(The slider wiring in `main()` — `state.forces[sl.dataset.force] = Number(sl.value); relayout();` — is unchanged and already correct because the slider `data-force` values now equal the new `state.forces` keys. Do NOT edit it.)

- [ ] **Step 6: Self-review**

`git diff`. Confirm: sliders use `data-force` keys `centre`/`repel`/`link`/`distance` with the step-aligned defaults; `state.forces` matches those keys/defaults; the extension is registered in a guarded `try/catch` with `d3ForceOk`; `graphLayout()` returns d3-force opts (with `manyBodyStrength: -state.forces.repel`, `xStrength`/`yStrength` = `centre`, `linkDistance`/`linkStrength`, `infinite:true`, `fixedAfterDragging:false`, `alphaTarget: AMBIENT_ALPHA`) or the cose fallback when `!d3ForceOk`; `startSim` stops any prior sim then runs a new one; `setView` calls `stopSim()` before swapping, runs `breadthfirst` for tree and `startSim()` for graph; `relayout` is debounced (120 ms) and restarts the sim; no Phase 1–3a note-node logic changed elsewhere.

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/viz/static/index.html toolkit/src/viz/static/app.js
git commit -m "feat(viz): continuous d3-force graph — live forces + drag-release

Swaps the graph from one-shot cose to a managed continuous cytoscape-d3-force
simulation (startSim/stopSim around a graphSim instance): subtle perpetual
motion (infinite + low alphaTarget), sliders mapped 1:1 to d3 forces and applied
live (debounced restart), and dragging releases nodes (fixedAfterDragging:false).
Falls back to static cose if the extension is unavailable. Tree view unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification (after this task):** build, launch, Playwright assert: the graph runs a `d3-force` sim (node positions change across successive ticks with NO interaction, proving it's alive) and stays gently in motion; sliders match `state.forces` on fresh load and moving Repel updates `state.forces.repel` and visibly reshapes the graph; switching to Tree stops the sim (positions stable + `#s-forces` hidden), back to Graph restarts it; dragging a node then releasing leaves it un-pinned (keeps moving after); filter/selection persist while the sim runs; console clean. Then human visual sign-off on the "alive but subtle" feel.

---

## Final: README + PR

- [ ] **Update the README `cortex viz` line** — change the ending `…, and a Graph/Tree view toggle.` to `…, a Graph/Tree view toggle, and live force controls (d3-force).` (keep it one line).

```bash
grep -n "cortex viz" /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/README.md
```

- [ ] **Push and open the PR**

```bash
git push -u origin feat/viz-phase4-forces
gh pr create --fill
```

(Note: this branch already contains earlier one-shot-`cose` commits for Phase 4; they are superseded by these commits on the same branch and ship together in one PR. The spec revision documents the engine change.)

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Vendoring (devDeps, copy-static, index.html scripts + shim) → Task 1. ✅
- Continuous d3-force sim (infinite, animate, subtle alphaTarget) → Task 2 Step 3 (`graphLayout`, `startSim`). ✅
- Live sliders mapped 1:1 → Task 2 Steps 1–2 (keys/ranges) + unchanged wiring + `relayout`. ✅
- Drag releases → `fixedAfterDragging:false`. ✅
- Running-instance management (stop before start; stop on tree) → `startSim`/`stopSim`, `setView`. ✅
- Fallback to static cose if extension absent → `d3ForceOk` guard in `graphLayout`. ✅
- Graph-only (hidden section + sim stopped in tree) → `setView`. ✅
- Non-goals (persistence, reset, pinning, backend) — none introduced. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; verification lists concrete observations. ✅

**Type consistency:** `state.forces` keys (`centre`/`repel`/`link`/`distance`) match the slider `data-force` attrs and every read in `graphLayout()`; `d3ForceOk`/`AMBIENT_ALPHA`/`graphSim`/`startSim`/`stopSim`/`relayout` named consistently across Task 2; `graphLayout()` used by `startSim` (and the cose fallback path) with no lingering `cose`-shape `state.forces` reference. ✅
