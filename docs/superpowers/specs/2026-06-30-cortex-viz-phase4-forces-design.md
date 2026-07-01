# Cortex `viz` — UX Phase 4: Live force controls (design)

**Date:** 2026-06-30 (revised — switched engine from one-shot `cose` to continuous `d3-force`)
**Status:** Approved for planning
**Scope:** `toolkit/src/viz/static/index.html`, `style.css`, `app.js`, plus `toolkit/scripts/copy-static.mjs` (vendoring) and `toolkit/package.json` (dev deps). No backend/server/`/api/graph` change.

## Background & decision

An earlier revision of this phase tuned a one-shot `cose` layout via four sliders. On review it felt **jerky** — `cose` re-lays-out and the graph *jumps* to the new positions. The desired feel is Obsidian's graph: **alive** (never static), where sliders reshape the graph smoothly in real time and nodes can be dragged.

Obsidian's graph is powered by **d3-force**. The revised design adopts the same engine via **`cytoscape-d3-force`** (a Cytoscape layout extension wrapping `d3-force`). This is a continuous simulation: nodes have gentle perpetual motion, slider changes are applied live, and dragging perturbs the system elastically. The four sliders map 1:1 to d3 forces.

**Dependency note:** `cytoscape-d3-force` (~18 KB) and its `d3-force` peer (~8 KB min) are **vendored offline** into `dist/viz/static/vendor/`, exactly like the existing `cytoscape.min.js` — they are build-time devDependencies copied into the shipped viewer assets, NOT runtime dependencies a consumer installs. This preserves the light-install property (the base `@n1x-technologies/cortex` dependency tree is unchanged).

## Goals

1. Graph view runs a **continuous d3-force simulation** — subtle perpetual motion, never frozen.
2. Four sliders in a collapsible "Forces" section map to d3 forces and are applied **live**.
3. **Dragging a node releases it** back into the simulation (no pin) so the graph reacts elastically.
4. Everything else (tree view, filter, color-by, search, panel) keeps working; forces are graph-only.

## Non-goals (deferred)

- Persisting slider values across reloads.
- A reset-to-defaults button.
- Any `graphData.ts` / `server.ts` / `/api/graph` change.
- Tree-view physics (tree stays `breadthfirst`).
- Pinning dragged nodes (explicitly the opposite: drag releases).

## Design

### Vendoring (`copy-static.mjs` + `package.json` + `index.html`)

- Add devDependencies `cytoscape-d3-force@^1.1.4` and `d3-force@^3`.
- `copy-static.mjs` copies two more UMD files into `vendor/`: `d3-force.min.js` (from `d3-force/dist/d3-force.min.js`) and `cytoscape-d3-force.js` (from `cytoscape-d3-force/cytoscape-d3-force.js`).
- `index.html` `<head>` loads, **in order**, after `cytoscape.min.js`:
  ```html
  <script src="vendor/d3-force.min.js"></script>
  <script>window['d3-force'] = window.d3;</script>
  <script src="vendor/cytoscape-d3-force.js"></script>
  ```
  The shim is required because `cytoscape-d3-force`'s UMD browser branch reads `root["d3-force"]`, whereas `d3-force`'s UMD exposes the global as `d3`.
- `app.js` registers the extension once at startup: `cytoscape.use(window.cytoscapeD3Force)` (guarded if already registered).

### Slider → d3 force mapping

`state.forces` (new shape; defaults chosen to give a pleasant Obsidian-like spread):

| Sidebar label | `state.forces` key | d3-force option | Applied as | Default | min | max | step |
|---|---|---|---|---|---|---|---|
| Centre force | `centre` | `xStrength` & `yStrength` | both = `centre` | 0.1 | 0 | 1 | 0.05 |
| Repel force | `repel` | `manyBodyStrength` | `-repel` (negative = repulsion) | 300 | 0 | 1000 | 25 |
| Link force | `link` | `linkStrength` | `link` | 0.5 | 0 | 1 | 0.05 |
| Link distance | `distance` | `linkDistance` | `distance` | 40 | 10 | 300 | 5 |

Slider `data-force` attributes use the `state.forces` keys (`centre`/`repel`/`link`/`distance`), and each slider's `value`/`min`/`max`/`step` matches this table (step-aligned so the thumb reflects the true value).

### Continuous layout (`app.js`)

`graphLayout()` returns the d3-force options built from `state.forces`:

```js
function graphLayout() {
  return {
    name: 'd3-force', animate: true, infinite: true, fixedAfterDragging: false,
    linkId: (d) => d.id, linkDistance: state.forces.distance, linkStrength: state.forces.link,
    manyBodyStrength: -state.forces.repel,
    xStrength: state.forces.centre, yStrength: state.forces.centre,
    alphaTarget: AMBIENT_ALPHA, velocityDecay: 0.4,
  };
}
```

- `infinite: true` keeps the simulation running (never auto-ends) → the graph stays alive.
- `alphaTarget: AMBIENT_ALPHA` (a small constant, start `0.02`, tunable in QA) keeps a **subtle** perpetual motion instead of freezing; `velocityDecay: 0.4` keeps it calm rather than jittery.
- `fixedAfterDragging: false` → **drag releases** the node.

**Running-instance management** (the key difference from a one-shot layout): the simulation is a persistent, long-running layout that must be explicitly stopped, or multiple simulations stack and the graph thrashes.

- A module var `graphSim` holds the current running `d3-force` layout (or `null`).
- `startSim()`: if `state.view === 'graph'`, stop any existing `graphSim`, then `graphSim = cy.layout(graphLayout()); graphSim.run();`.
- `stopSim()`: if `graphSim`, `graphSim.stop(); graphSim = null;`.
- `setView()`: for graph → run tree/graph elements as today, then `startSim()` (instead of the old one-shot `cose` run) and show `#s-forces`; for tree → `stopSim()`, run `TREE_LAYOUT` (`breadthfirst`, unchanged), hide `#s-forces`.

### Live slider updates (`app.js`)

Slider `input` writes `state.forces[key] = Number(value)` and calls a debounced `relayout()` that, **graph-view only**, restarts the sim with the new forces:

```js
let relayoutTimer;
function relayout() {
  if (state.view !== 'graph') return;
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => startSim(), 120);
}
```

`startSim()` stops the prior sim and starts a fresh one with updated forces; because it's a continuous animated simulation the transition reads as a smooth live reshaping, not a jump. The 120 ms debounce collapses a drag burst.

### Interplay with Phases 1–3a

- **Continuous ticks + selection/fade/filter:** the sim only moves node *positions*; `.faded`/`.spotlight`/`.hidden` classes and selection are position-independent, so highlight/filter persist while the graph moves. `updateFocus`/`applyFilter`/`recolor` are unchanged.
- **Tree view:** unchanged `breadthfirst`; `stopSim()` ensures no d3-force sim runs in tree.
- **Focus animation (`focusNode`)** still pans/zooms; it composes with the running sim (sim moves nodes, `focusNode` moves the viewport).
- **Node dragging:** provided by `cytoscape-d3-force`'s drag handlers; with `fixedAfterDragging: false` the node rejoins the simulation on release.

## Error handling & edge cases

- **Extension load failure** (vendor file missing): guard `cytoscape.use` and fall back — if `window.cytoscapeD3Force` is undefined, log and keep the graph static (nodes still render at their last positions via a one-shot `cose` fallback layout). This keeps the viewer usable if vendoring regresses.
- **Leaving graph view:** `stopSim()` on switching to tree prevents a background simulation from burning CPU.
- **Rapid dragging of sliders:** 120 ms debounce + stop-before-start (no stacked sims).
- **Empty/tiny graph:** d3-force handles any node count; a single node just sits centered.
- **Filter/selection across a relayout:** unaffected (relayout only restarts positions).

## Components touched

| File | Change |
|---|---|
| `package.json` | Add devDeps `cytoscape-d3-force`, `d3-force`. |
| `scripts/copy-static.mjs` | Vendor `d3-force.min.js` + `cytoscape-d3-force.js` into `vendor/`. |
| `index.html` | Load the two vendor scripts + the `window['d3-force']` shim after `cytoscape.min.js`; keep the `#s-forces` section (slider ranges/defaults per the table). |
| `style.css` | (Unchanged from the current Forces styling — already present.) |
| `app.js` | Register the extension; `state.forces` new shape; `graphLayout()` → d3-force options; `startSim()`/`stopSim()` + `graphSim` var; `setView` runs/stops the sim and toggles `#s-forces`; debounced `relayout()` restarts the sim; slider wiring; `cose` fallback if the extension is absent. |

## Verification

No frontend test harness (`app.js` is a non-module browser script), so verification is:

1. **Playwright on a built `dist`** against the sample vault, asserting:
   - The extension registered; graph view runs a `d3-force` sim — node positions **change over successive ticks with no interaction** (proves it's alive), then remain gently in motion.
   - Sliders match `state.forces` on fresh load (step-aligned) and moving one (e.g. Repel) updates `state.forces.repel` and visibly reshapes the graph.
   - Switching to tree stops the sim (positions stable, `#s-forces` hidden); back to graph restarts it and shows the section.
   - Dragging a node then releasing leaves it un-pinned (it keeps moving with the sim afterwards).
   - Filter/selection persist while the sim runs; console clean.
2. **User visual sign-off** on the "alive but subtle" motion and drag feel.

## Rollout

Single PR on `feat/viz-phase4-forces` (supersedes the earlier one-shot `cose` commits on the same branch). Per repo convention, update the `README.md` `cortex viz` line to mention live/tunable force controls. Phase 3b (Mermaid) is specced separately afterward.
