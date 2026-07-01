# Cortex `viz` — UX Phase 4: Force controls (design)

**Date:** 2026-06-30
**Status:** Approved for planning
**Scope:** `toolkit/src/viz/static/index.html`, `style.css`, `app.js` only. No backend, server, or `/api/graph` change. Builds on Phases 1–3a (sidebar, filter, Graph/Tree toggle), now on `main`.

## Background

The graph view uses a Cytoscape `cose` force layout with fixed parameters (`nodeRepulsion: 6000`, `idealEdgeLength: 70`; `gravity` and `edgeElasticity` at `cose` defaults). Users can't tune how the graph spreads. Obsidian's graph view exposes four "Forces" sliders (Centre / Repel / Link force / Link distance); this phase adds the equivalent so the layout can be tuned live.

Per the agreed decision, this uses the **one-shot `cose`** approach — sliders adjust `cose` parameters and re-run the layout (debounced) — with **no new dependency**. A continuous physics engine (fcose/cola) was considered and rejected to keep the install light; the graph re-settles on each adjustment rather than flowing continuously.

## Goals

1. A collapsible **"Forces"** section in the sidebar with four sliders mapped to `cose` parameters.
2. Moving a slider updates the parameter, shows its value, and re-runs the graph layout (debounced) so the change is visible.
3. Defaults reproduce today's layout exactly — nothing changes until a slider moves.
4. Forces apply only to the graph view; the section is hidden in tree view.

## Non-goals (deferred)

- Continuous/live physics simulation (fcose/cola) — rejected; one-shot `cose` only.
- Persisting slider values across reloads (no storage).
- A reset-to-defaults button (possible cheap follow-up; out of scope here).
- Any `graphData.ts` / `server.ts` / `/api/graph` change; no engine change (stays Cytoscape `cose`).
- Tree-view layout tuning (tree uses `breadthfirst`; forces are graph-only).

## Design

### Slider → parameter mapping and ranges

`state.forces` holds the four values; defaults equal the effective current layout, so the initial render is unchanged:

| Sidebar label | `cose` param | Default | min | max | step |
|---|---|---|---|---|---|
| Centre force | `gravity` | 1 | 0 | 4 | 0.1 |
| Repel force | `nodeRepulsion` | 6000 | 1000 | 20000 | 500 |
| Link force | `edgeElasticity` | 32 | 0 | 400 | 5 |
| Link distance | `idealEdgeLength` | 70 | 20 | 300 | 5 |

(`gravity: 1` and `edgeElasticity: 32` are the `cose` defaults in effect today; `nodeRepulsion: 6000` and `idealEdgeLength: 70` are today's explicit overrides. So the default slider positions reproduce the current graph exactly.)

### Markup (`index.html`)

A new sidebar section between `#s-filter` and `#s-stats`, collapsible via native `<details>`:

```html
<section id="s-forces">
  <details open>
    <summary>Forces</summary>
    <label class="force">Centre force<input type="range" data-force="gravity" min="0" max="4" step="0.1" value="1"></label>
    <label class="force">Repel force<input type="range" data-force="nodeRepulsion" min="1000" max="20000" step="500" value="6000"></label>
    <label class="force">Link force<input type="range" data-force="edgeElasticity" min="0" max="400" step="5" value="32"></label>
    <label class="force">Link distance<input type="range" data-force="idealEdgeLength" min="20" max="300" step="5" value="70"></label>
  </details>
</section>
```

### Layout construction (`app.js`)

`state` gains `forces: { gravity: 1, nodeRepulsion: 6000, edgeElasticity: 32, idealEdgeLength: 70 }`.

The `GRAPH_LAYOUT` constant is replaced by a function that builds `cose` options from `state.forces`:

```js
function graphLayout() {
  return { name: 'cose', animate: false,
    gravity: state.forces.gravity,
    nodeRepulsion: state.forces.nodeRepulsion,
    edgeElasticity: state.forces.edgeElasticity,
    idealEdgeLength: state.forces.idealEdgeLength };
}
```

`setView()` uses `graphLayout()` (call, not const) for the graph branch; the tree branch keeps `TREE_LAYOUT`.

### Re-layout on slider change (`app.js`)

A debounced `relayout()` re-runs only the graph layout:

```js
let relayoutTimer;
function relayout() {
  if (!cy || state.view !== 'graph') return;
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(() => cy.layout(graphLayout()).run(), 200);
}
```

Each slider's `input` handler writes `state.forces[param] = Number(value)`, updates the shown value, and calls `relayout()`. Because `relayout` is debounced (~200 ms) and guarded to graph view, dragging is responsive without thrashing, and it is inert in tree view.

### Graph-only visibility (`app.js`)

`setView()` shows/hides `#s-forces` by `state.view`: visible in graph, `display:none` in tree. (The section is inert in tree anyway via the `relayout` guard; hiding it avoids a control that does nothing.)

### Styling (`style.css`)

- `#s-forces .force`: block label + full-width range input, small label text, spacing between sliders (mirrors Obsidian's stacked layout).
- `<summary>` styled as a section header consistent with the sidebar; `<details>` open by default.
- Range inputs themed to the palette (accent thumb via `accent-color: var(--coral)`), no new colors.

## Error handling & edge cases

- **Tree view:** `#s-forces` hidden and `relayout()` no-ops (guarded on `state.view === 'graph'`), so sliders can't trigger a `breadthfirst`-incompatible layout.
- **Rapid dragging:** the 200 ms debounce collapses a burst of `input` events into one relayout.
- **Returning to graph view:** `setView`'s graph branch already runs `graphLayout()` with the current `state.forces`, so any values set earlier are applied on the next graph render without needing a separate relayout.
- **Out-of-range:** the `min`/`max`/`step` attributes clamp values; `Number()` parses the slider string.
- **Filter/selection unaffected:** `relayout` only re-runs the layout (positions); it does not touch `.hidden`/selection/`updateFocus`, so filtering and highlighting persist across a relayout.

## Components touched

| File | Change |
|---|---|
| `index.html` | Add `#s-forces` (collapsible `<details>` with four range inputs) between `#s-filter` and `#s-stats`. |
| `style.css` | `#s-forces` / `.force` / `<summary>` / range-input styling (palette accent). |
| `app.js` | Add `state.forces`; replace `GRAPH_LAYOUT` const with `graphLayout()`; use it in `setView`; add debounced `relayout()`; wire the four sliders; toggle `#s-forces` visibility in `setView`. |

No backend or data-shape change.

## Verification

No frontend test harness (`app.js` is a non-module browser script), so verification is:

1. **Playwright on a built `dist`** against the sample vault, asserting:
   - Default render matches the current graph (slider defaults = current params).
   - Moving a slider updates `state.forces[param]` (e.g. `nodeRepulsion`) and re-runs the layout — node positions change after the debounce.
   - The shown value updates with the slider.
   - Switching to tree hides `#s-forces` and makes `relayout()` a no-op; switching back to graph shows it and applies the current forces.
   - Filter/selection persist across a relayout; console clean.
2. **User visual sign-off** on the Forces controls and how the graph responds.

## Rollout

Single PR on `feat/viz-phase4-forces`, stacked on merged Phase 3a. Per repo convention, update the `README.md` `cortex viz` line to mention tunable force controls. Phase 3b (Mermaid architecture view) is specced separately afterward.
