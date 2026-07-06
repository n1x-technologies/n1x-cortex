# Cortex `viz` — UX Phase 2: Grouping/filtering + branded sidebar (design)

**Date:** 2026-06-30
**Status:** Approved for planning
**Scope:** `toolkit/src/viz/static/index.html`, `style.css`, and `app.js` only. No backend, server, or `/api/graph` shape changes. Builds on Phase 1 (animated focus, neighborhood highlighting, bidirectional panel), now on `main`.

## Background

The viewer today is a top header bar (brand, stats, *Color by*, search), a Cytoscape canvas, a **floating** node-info panel (opens on click, top-right), and a **floating** legend (bottom-left) that only labels colors — it cannot filter. Phase 2 does two things:

1. Restructure the layout into a **persistent right sidebar** (graphify-style) that stacks the controls in a clear top-to-bottom hierarchy.
2. Turn the legend into an **interactive tri-state filter** driven by the active *Color by* dimension, so whole groups can be hidden/shown.

The grouping/filtering dimension **reuses the existing *Color by* selector** (type / status / freshness) — no new grouping axis is introduced; the data already carries these fields.

## Goals

1. **Two-column layout** — `#cy` (graph) on the left, a fixed-width `#sidebar` on the right; the top header bar is removed and its contents move into the sidebar.
2. **Sidebar sections**, top to bottom: (a) brand + search, (b) node info, (c) *Color by* + interactive filter, (d) stats.
3. **Tri-state group filter** — each group of the active dimension is a row (checkbox + color dot + label + count); unchecking **hides** those nodes; an "All" header checkbox reflects and toggles all/none/partial.
4. Preserve all Phase 1 behavior (focus, highlighting, in/out panel) unchanged.

## Non-goals (deferred)

- Community/cluster detection (Phase 2 filters by the existing type/status/freshness groups only).
- Folder as a separate grouping axis.
- Tree view and Mermaid architecture view (Phase 3).
- Any `graphData.ts` / `server.ts` / `/api/graph` change.
- Engine change (stays Cytoscape).

## Design

### Layout (`index.html` + `style.css`)

`<main>` becomes a horizontal flex container with two children:

- `#cy` — `flex: 1`, the graph canvas (unchanged responsibilities).
- `#sidebar` — fixed width (`300px`), full height, `overflow-y: auto`, `background: var(--panel)`, left border `var(--line)`. Contains four stacked `<section>`s:
  1. `#s-head` — the `N1X Cortex` brand and the `#search` input (moved from the old bar).
  2. `#s-info` — the node-info panel (title, meta `<dl>`, in/out links). Shows an empty-state line ("Select a node to inspect it") when nothing is selected.
  3. `#s-filter` — the `Color by` `<select>` (moved) and the interactive filter list `#legend`.
  4. `#s-stats` — the stats line (`N notes · gaps · drafts · uncited`).

The old `#bar` header and the floating `#panel`/`#legend` positioning are removed. `#panel`'s inner markup (`#p-title`, `#p-meta`, `#p-links`, `#panel-close`) is re-homed inside `#s-info`; the close button is dropped (the panel is now a permanent section, not a dismissible overlay) — a background tap clears selection and returns `#s-info` to its empty state instead of hiding a floating element.

Palette: navy `#1A1A2E` / coral `#E94560` via the existing `:root` vars; no new colors.

### Interactive tri-state filter (`app.js`)

State gains `state.hidden` — a `Set` of group keys currently hidden for the active mode.

`buildLegend()` is replaced by `buildFilter()`, which renders, for the active mode's groups (the same entries the current legend computes — `typeColors` / `statusColors` / the fixed freshness buckets), one row each:

```
[✓] ● <label>   <count>
```

Plus a header row:

```
[✓] All
```

- Group counts come from `state.data.stats.byType` / `byStatus`, and for freshness from a client-side tally of `node.freshness`. Gap/missing nodes (`exists:false`) are a dedicated `gaps` row so they can be hidden independently.
- Clicking a group checkbox toggles its key in `state.hidden` and calls `applyFilter()`.
- The **All** checkbox is tri-state: `checked` when `state.hidden` is empty, `unchecked` when all groups are hidden, `indeterminate` otherwise. Clicking it when not-all-hidden hides all; clicking when all-hidden shows all. Its `indeterminate` DOM property is set on each render.

`applyFilter()` sets a `.hidden` Cytoscape class on nodes whose group key is in `state.hidden`:

```js
{ selector: '.hidden', style: { 'display': 'none' } }
```

Cytoscape `display: none` removes the node (and its incident edges) from rendering **without re-running layout**, so hiding does not reshuffle the graph. A node's group key is derived by the same logic as `nodeColor` uses for the active mode (`gaps` when `!exists`, else `freshness` / `status` / `type`).

**Reset on dimension change:** changing `Color by` clears `state.hidden` (groups differ across dimensions), rebuilds the filter, and re-applies (everything visible).

### Interplay with Phase 1

- Filtering (`display: none`) and highlighting (`.faded`/`.spotlight`, opacity) are orthogonal channels — no conflict.
- `updateFocus` is unchanged. A hidden node may still be part of a `closedNeighborhood`, but being `display:none` it is simply not shown; `addClass` on it is harmless.
- Search still routes through `updateFocus`; the input just lives in `#s-head` now.
- `recolor()` continues to work; it now also calls `buildFilter()` (which replaces `buildLegend()`).

## Error handling & edge cases

- **Null group** (type/status absent on a note) → label rendered as "—", consistent with today's legend.
- **All groups hidden** → empty canvas; valid. **Stats reflect the vault, not the visible subset** (unchanged numbers) — this is the expected reading of "how big is my vault".
- **No selection** → `#s-info` shows its empty-state line.
- **Freshness gaps vs type/status gaps** — in every mode, `exists:false` nodes map to the `gaps` group key (they have no type/status), giving one consistent way to hide missing nodes.
- **Dimension switch mid-filter** — handled by the reset above; no stale hidden keys leak across modes.

## Components touched

| File | Change |
|---|---|
| `index.html` | Remove `#bar`; make `<main>` a two-column flex; add `#sidebar` with `#s-head`/`#s-info`/`#s-filter`/`#s-stats`; re-home search, Color by, panel markup, stats; drop `#panel-close`. |
| `style.css` | Two-column layout; sidebar + section styling; filter-row styling (checkbox, dot, label, count); empty-state; remove floating-panel/legend/bar rules. Branded, existing palette. |
| `app.js` | Add `state.hidden`; replace `buildLegend` with `buildFilter` (tri-state, counts); add `applyFilter` + a `groupKey(node)` helper; retarget `showPanel`/`hidePanel` to `#s-info` (empty-state instead of hide); move the search/colorby/background-tap wiring to the new elements; `recolor` calls `buildFilter`. |

No backend or data-shape change. `/api/graph` already carries `stats.byType`/`byStatus`, `node.type`/`status`/`freshness`/`exists`.

## Verification

Same approach as Phase 1 — no frontend test harness exists (`app.js` is a non-module browser script), so verification is:

1. **Playwright on a built `dist`** against the sample vault, asserting objectively:
   - Layout: `#sidebar` present with the four sections in order; no `#bar`.
   - Filter: unchecking a group adds `.hidden`/`display:none` to exactly that group's nodes (and hides their edges); re-checking restores them.
   - Tri-state: `All` is checked with nothing hidden, unchecked with all hidden, `indeterminate` with a partial selection; toggling `All` hides/shows everything.
   - Reset: switching `Color by` clears `state.hidden` and shows all.
   - Info panel: selecting a node fills `#s-info`; background tap returns it to the empty state; Phase 1 focus/highlight/in-out behavior still works.
   - Console clean.
2. **User visual sign-off** on the branded sidebar look and feel.

## Rollout

Single PR on `feat/viz-phase2-grouping`, stacked on the merged Phase 1. Per repo convention, update `README.md`'s `cortex viz` line if the sidebar/filter changes what it advertises. Phase 3 (tree + Mermaid views) is specced separately afterward.
