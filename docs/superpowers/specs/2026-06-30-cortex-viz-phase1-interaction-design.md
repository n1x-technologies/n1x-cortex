# Cortex `viz` — UX Phase 1: Interaction polish (design)

**Date:** 2026-06-30
**Status:** Approved for planning
**Scope:** `toolkit/src/viz/static/app.js` and `toolkit/src/viz/static/style.css` only. No backend, server, or graph-data-shape changes.

## Background

`cortex viz` serves a local web viewer that renders the note graph with Cytoscape
(`cose` force layout). Today it offers: a header bar (brand, stats, *Color by*
dropdown, search), the graph canvas, a click-to-open side panel (title, meta,
outgoing links), and a legend. It works but the interaction is flat — clicking a
node does not move the view, there is no way to see a node's local neighborhood,
and the panel only shows *outgoing* links.

A comparison against the external `graphify` project (a code-graph tool using
vis-network) surfaced three low-effort, high-value interaction upgrades that are
all achievable natively in Cytoscape — no engine migration, no new dependencies.
This spec covers those three as **Phase 1** of a larger, separately-specced viewer
rework (Phase 2: grouping/filtering + branded sidebar; Phase 3: tree + Mermaid
views).

## Goals

1. **Animated focus** — selecting or navigating to a node smoothly centers (and
   gently zooms) the view on it, instead of the view staying put.
2. **Neighborhood highlighting** — hovering or selecting a node makes its local
   neighborhood legible by fading everything else.
3. **Incoming + outgoing neighbors in the panel** — the detail panel shows both
   what a note links *to* and what links *back to it*, each clickable, labeled by
   note title rather than raw id.

## Non-goals (deferred to later phases)

- Group/community filtering and tri-state checkboxes (Phase 2).
- Sidebar layout redesign / rebrand (Phase 2).
- Tree view and Mermaid architecture view (Phase 3).
- Any change to `graphData.ts`, `server.ts`, or the `/api/graph` payload.
- Engine migration (we stay on Cytoscape — confirmed decision).

## Design

### 1. Animated focus — `focusNode(node)`

A single helper centralizes view movement:

```js
function focusNode(node) {
  const targetZoom = Math.max(cy.zoom(), 1.2); // never zoom out on focus; gentle zoom-in when far
  cy.animate(
    { center: { eles: node }, zoom: targetZoom },
    { duration: 350, easing: 'ease-out' }
  );
}
```

- Called when: a node is tapped, and when a neighbor link in the panel is clicked.
- Rationale for `Math.max(cy.zoom(), 1.2)`: if the user is already zoomed in, we
  only re-center (no jarring extra zoom); if they are zoomed far out, we bring the
  node to a readable scale. The `1.2` floor is a starting value, tunable during QA.
- Replaces the current instant `cy.center(node)` used in the panel's neighbor-link
  handler.

### 2. Neighborhood highlighting (hover + selection)

Introduce a single Cytoscape class, `.faded`, and drive all dimming through it
(both hover and search), so the two features do not fight over inline `opacity`.

**CSS-in-Cytoscape style additions** (in the `style` array in `render()`):

```js
{ selector: '.faded', style: { 'opacity': 0.12, 'text-opacity': 0 } },
```

**Behavior:**

- `cy.on('mouseover', 'node', ...)` → fade all elements, then un-fade
  `node.closedNeighborhood()` (the node, its neighbors, and the connecting edges).
- `cy.on('mouseout', 'node', ...)` → clear hover fading and re-apply the current
  search/selection state (see "State precedence" below).
- On **select** (node tap), apply the same neighborhood highlight but make it
  **persistent** until the user taps the background (which already hides the panel;
  it will now also clear the highlight).

**State precedence** (the one subtle part):

There are three sources of "what is faded": search term, current selection, and
transient hover. To keep them from clobbering each other, dimming is computed from
a single function rather than set ad-hoc:

```js
function applyDimState() {
  // Priority: hover (transient) > selection (persistent) > search term > none.
  // Compute the "focus set" of elements to keep bright; fade the complement.
}
```

- `applySearch()` is refactored to add/remove `.faded` via this function instead of
  setting inline `n.style('opacity', ...)`.
- Hover calls `applyDimState()` with a hover focus set; `mouseout` recomputes
  without it, falling back to selection or search.
- Result: hovering while a search is active previews the hovered neighborhood, and
  releasing the hover returns to the search-dimmed state — no stuck-faded nodes.

### 3. Panel: incoming + outgoing neighbors

Extract a pure helper and render two labeled sections.

```js
// Pure — unit-testable in isolation.
function neighborsOf(edges, id) {
  const outgoing = edges.filter(e => e.source === id).map(e => e.target);
  const incoming = edges.filter(e => e.target === id).map(e => e.source);
  return { outgoing, incoming };
}
```

- Build an `id → title` map once (from `state.data.nodes`) so links show the note
  title, falling back to the id when a title is absent (e.g. dangling/gap nodes).
- `showPanel(n)` renders:
  - **connects to** — outgoing neighbors (existing behavior, now titled).
  - **linked from** — incoming neighbors (new).
- Each link's click handler: `focusNode(node)` + `node.select()` + `showPanel`.
- Keep the existing 25-item slice per list to avoid unbounded panels on hub nodes;
  when a list is truncated, show a `+N more` hint line.

## Components touched

| File | Change |
|---|---|
| `toolkit/src/viz/static/app.js` | Add `focusNode`, `neighborsOf`, `applyDimState`; refactor `applySearch`, `showPanel`, and the `tap`/`mouseover`/`mouseout` handlers; add `id→title` map. |
| `toolkit/src/viz/static/style.css` | No change expected (fading is a Cytoscape class, not DOM CSS); may add a small `.panel .more` hint style. |

No other files change. The `/api/graph` payload already carries everything needed
(`nodes[].title`, `edges[].source/target`).

## Error handling & edge cases

- **Dangling / gap nodes** (`exists: false`): may appear as a neighbor target with
  no node entry of its own — `focusNode` must no-op safely if `cy.getElementById`
  is empty (guard already exists for the current neighbor handler; keep it).
- **Self-loops / duplicate edges**: `graphData.ts` already dedupes parallel edges,
  so `neighborsOf` will not double-count.
- **Hub nodes** (very high degree): neighbor lists are sliced to 25 with a `+N more`
  hint; highlighting a large `closedNeighborhood()` is still cheap in Cytoscape.
- **Hover during animation**: focus animation and hover fading are independent
  (transform vs. opacity), so they compose without conflict.

## Verification

The viewer has no frontend test harness (the `viz` tests cover `graphData.ts`, not
the static assets), so Phase 1 is verified by:

1. **Pure-helper check** — `neighborsOf(edges, id)` is pure; if a lightweight test
   is cheap to add alongside the existing `graphData` tests, do so; otherwise assert
   its behavior by inspection. It is the only non-DOM logic.
2. **Manual QA** in `cortex viz` against a sample vault:
   - Clicking a node smoothly centers + gently zooms; clicking again elsewhere
     re-centers without a jarring zoom jump.
   - Hovering a node fades the rest and lights up its neighborhood; moving off
     restores the prior state (including an active search).
   - Selecting a node keeps its neighborhood lit until a background click clears it.
   - The panel shows both **connects to** and **linked from**, titled, and clicking
     either navigates (focus + select + panel refresh).
   - Search + hover interplay: hovering during an active search previews, releasing
     returns to the search-dimmed view with nothing stuck faded.

Success is visual and behavioral, not numeric: focus feels smooth, the neighborhood
is legible, and the panel is bidirectional.

## Rollout

Single PR on `feat/viz-phase1-interaction`. Per repo convention, update `README.md`
if it describes viewer interactions (check the `cortex viz` section before push).
Phases 2 and 3 are specced separately after this lands.
