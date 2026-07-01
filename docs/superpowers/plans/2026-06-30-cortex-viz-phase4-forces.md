# Cortex `viz` UX Phase 4 — Force Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "Forces" section to the `cortex viz` sidebar — four sliders that retune the graph's `cose` layout live (debounced), graph-view only.

**Architecture:** Client-only, one task. `state.forces` holds the four `cose` parameters (defaults = today's effective values, so nothing changes until a slider moves). `GRAPH_LAYOUT` becomes a `graphLayout()` function reading `state.forces`; a debounced `relayout()` re-runs the graph layout on slider input; `setView()` uses `graphLayout()` and hides the section in tree view.

**Tech Stack:** Vanilla browser JS (`app.js` is a plain `<script>`, not an ES module), Cytoscape (vendored), HTML, CSS.

## Global Constraints

- **Files in scope:** ONLY `toolkit/src/viz/static/index.html`, `style.css`, `app.js`. Do not touch `graphData.ts`, `server.ts`, or `/api/graph`.
- **Engine:** Stay on Cytoscape `cose`. No new libraries. `app.js` stays a plain browser `<script>` (no import/export).
- **Palette:** existing CSS `:root` vars / hex literals already in the file. Range accent uses `accent-color: var(--coral)`. No new colors.
- **Defaults reproduce today's layout:** `gravity: 1`, `nodeRepulsion: 6000`, `edgeElasticity: 32`, `idealEdgeLength: 70` (the first two are `cose` defaults in effect today; the last two are today's explicit overrides).
- **Graph-only:** forces apply to the `cose` graph view; the section is hidden and `relayout()` is a no-op in tree view.
- **Preserve Phases 1–3a:** focus, highlight, in/out panel, Color-by, filter, search, Graph/Tree toggle unchanged. `relayout` only re-runs the layout (positions) — it must not touch selection, `.hidden`, or `updateFocus`.
- **Verification is manual QA by design.** No frontend test harness; `app.js` is a non-module browser script. The implementer's gate is `node --check`; functional/visual verification (Playwright on a built `dist` + human sign-off) is done by the controller. The implementer does NOT run a browser.

## QA harness (controller runs this; implementer does not)

Sample vault at `…/scratchpad/qa-vault`. Build and serve:

```bash
cd /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit && npm run build
cd <qa-vault> && node /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/dist/cli.js viz
```

---

## Task 1: Forces section + live cose retuning

**Files:**
- Modify: `toolkit/src/viz/static/index.html` (add `#s-forces` between `#s-filter` and `#s-stats`)
- Modify: `toolkit/src/viz/static/style.css` (forces/slider styling)
- Modify: `toolkit/src/viz/static/app.js` (`state.forces`, `graphLayout()` replacing `GRAPH_LAYOUT`, debounced `relayout()`, `setView` uses `graphLayout()` + hides `#s-forces` in tree, slider wiring)

**Interfaces:**
- Produces: `state.forces` (`{gravity, nodeRepulsion, edgeElasticity, idealEdgeLength}`), `graphLayout()` → a fresh `cose` options object built from `state.forces`, `relayout()` → debounced graph-only re-run. DOM ids `#s-forces` and four `input[data-force]` range sliders.

- [ ] **Step 1: Add the Forces section to `index.html`**

Replace this exact block (the end of `#s-filter` through the start of `#s-stats`):

```html
        <div id="legend"></div>
      </section>
      <section id="s-stats">
```

with:

```html
        <div id="legend"></div>
      </section>
      <section id="s-forces">
        <details open>
          <summary>Forces</summary>
          <label class="force">Centre force<input type="range" data-force="gravity" min="0" max="4" step="0.1" value="1"></label>
          <label class="force">Repel force<input type="range" data-force="nodeRepulsion" min="1000" max="20000" step="500" value="6000"></label>
          <label class="force">Link force<input type="range" data-force="edgeElasticity" min="0" max="400" step="5" value="32"></label>
          <label class="force">Link distance<input type="range" data-force="idealEdgeLength" min="20" max="300" step="5" value="70"></label>
        </details>
      </section>
      <section id="s-stats">
```

- [ ] **Step 2: Style the Forces section in `style.css`**

Append to `style.css`:

```css
#s-forces summary { font-weight: 600; font-size: 12px; cursor: pointer; margin-bottom: 6px; }
#s-forces .force { display: block; color: var(--muted); font-size: 12px; margin-bottom: 8px; }
#s-forces .force input[type="range"] { display: block; width: 100%; margin-top: 4px; accent-color: var(--coral); }
```

- [ ] **Step 3: Add `forces` to `state`**

Replace this exact line:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null, hidden: new Set(), view: 'graph' };
```

with:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null, hidden: new Set(), view: 'graph', forces: { gravity: 1, nodeRepulsion: 6000, edgeElasticity: 32, idealEdgeLength: 70 } };
```

- [ ] **Step 4: Replace `GRAPH_LAYOUT` with `graphLayout()` + add `relayout()`**

Replace this exact line:

```js
const GRAPH_LAYOUT = { name: 'cose', animate: false, nodeRepulsion: 6000, idealEdgeLength: 70 };
```

with:

```js
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

- [ ] **Step 5: `setView()` uses `graphLayout()` and toggles `#s-forces` visibility**

Replace this exact function:

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

with:

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

- [ ] **Step 6: Wire the sliders in `main()`**

In `main()`, immediately after the view-toggle wiring block (the `document.querySelectorAll('#viewtoggle button').forEach(...)` call that ends with `}));`), add:

```js
  document.querySelectorAll('#s-forces input[data-force]').forEach(sl => sl.addEventListener('input', () => {
    state.forces[sl.dataset.force] = Number(sl.value);
    relayout();
  }));
```

- [ ] **Step 7: Syntax gate**

Run: `node --check /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/src/viz/static/app.js`
Expected: clean exit, no output.

- [ ] **Step 8: Self-review**

`git diff` on the three files. Confirm: `#s-forces` (collapsible `<details>` + four `input[data-force]` sliders with the exact min/max/step/value) sits between `#s-filter` and `#s-stats`; CSS added; `state.forces` present with the four defaults; `GRAPH_LAYOUT` fully replaced by `graphLayout()` (no lingering `GRAPH_LAYOUT` reference); `relayout()` is debounced and guarded to `state.view === 'graph'`; `setView` uses `graphLayout()` and sets `#s-forces` display by view; the slider handler writes `state.forces[dataset.force] = Number(value)` and calls `relayout()`. No Phase 1–3a logic altered beyond these edit sites.

- [ ] **Step 9: Commit**

```bash
git add toolkit/src/viz/static/index.html toolkit/src/viz/static/style.css toolkit/src/viz/static/app.js
git commit -m "feat(viz): tunable force controls (Centre/Repel/Link force, Link distance)

A collapsible Forces section adds four sliders mapped to cose params
(gravity/nodeRepulsion/edgeElasticity/idealEdgeLength). Slider input writes
state.forces and re-runs the graph layout (debounced 200ms). Defaults
reproduce the current layout; the section is hidden and relayout no-ops in
tree view. No new dependencies.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification (after this task):** build `dist`, launch, Playwright assert: the Forces section renders with four sliders at their defaults and the initial graph is unchanged; moving the Repel (`nodeRepulsion`) slider updates `state.forces.nodeRepulsion` and, after the 200 ms debounce, node positions change; switching to Tree sets `#s-forces` `display:none` and `relayout()` no-ops; switching back to Graph shows it and applies current forces; filter/selection persist across a relayout; console clean. Then human visual sign-off.

---

## Final: README + PR

- [ ] **Update the README `cortex viz` line** to mention tunable forces. Current line ends:
  `…, a tri-state group filter, and a Graph/Tree view toggle.`
  Change the ending to `…, a tri-state group filter, a Graph/Tree view toggle, and tunable force controls.` (keep it one line).

```bash
grep -n "cortex viz" /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/README.md
```

- [ ] **Push and open the PR**

```bash
git push -u origin feat/viz-phase4-forces
gh pr create --fill
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Collapsible Forces section, four sliders mapped to `cose` params → Step 1 (HTML), Step 4 (`graphLayout`). ✅
- Slider moves value + re-runs layout (debounced) → Step 4 (`relayout`), Step 6 (wiring). ✅
- Defaults reproduce today's layout (`gravity 1`, `nodeRepulsion 6000`, `edgeElasticity 32`, `idealEdgeLength 70`) → Step 3 `state.forces` + Step 1 slider `value`s match. ✅
- Graph-only (hidden + no-op in tree) → Step 5 (`#s-forces` display toggle), Step 4 (`relayout` guard). ✅
- Palette (accent-color coral, no new colors) → Step 2. ✅
- Non-goals (physics engine, persistence, reset button, backend) — none introduced. ✅
- Edge cases: rapid drag (debounce), returning to graph (`setView` runs `graphLayout()`), out-of-range (slider min/max/step + `Number()`), filter/selection unaffected (`relayout` only re-runs layout). ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; verification lists concrete observations. ✅

**Type consistency:** `state.forces`, the four param names (`gravity`/`nodeRepulsion`/`edgeElasticity`/`idealEdgeLength`) match between `state`, `graphLayout()`, the slider `data-force` attrs, and the handler; `graphLayout()` replaces every `GRAPH_LAYOUT` use (only site is `setView`); `relayout`/`relayoutTimer`/`#s-forces` named consistently. ✅
