# Cortex `viz` — UX Phase 3a: Folder tree view (design)

**Date:** 2026-06-30
**Status:** Approved for planning
**Scope:** `toolkit/src/viz/static/index.html`, `style.css`, `app.js` only. No backend, server, or `/api/graph` shape change. Builds on Phase 1 (focus/highlight/panel) and Phase 2 (sidebar + filter), now on `main`.

## Background

The viewer renders the note graph (wikilinks) with a `cose` force layout inside a branded right sidebar. Phase 3 adds alternate **views** of the same vault. Per the agreed decomposition, Phase 3 is split: **3a = a folder tree view** (this spec), **3b = a Mermaid architecture view** (separate spec, decided later).

The tree view answers "how is my vault organized?" rather than "how do notes link?". It reuses the existing Cytoscape instance with a hierarchical layout — no new dependencies, and Phase 1/2 behavior (info panel, Color-by, filter, search, focus, highlight) keeps working on the note nodes.

## Goals

1. A **view toggle** (`Graph | Tree`) that switches the canvas between the wikilink graph and a folder tree, without touching the rest of the sidebar.
2. A **folder tree**: a synthetic root → one node per top-level folder → the notes in it, connected by containment edges (not wikilinks).
3. **Reuse** Phase 1/2 on note nodes in tree view: click → focus + sidebar info; Color-by colors notes; the tri-state filter hides note groups; search/highlight work.

## Non-goals (deferred)

- Mermaid architecture view (Phase 3b).
- Collapsible/expandable folders (Cytoscape `breadthfirst` renders a static hierarchy; expand-collapse would add a dependency — out of scope).
- Nested folder chains: `node.folder` carries only the **top-level** folder (`relPath.split('/')[0]`), so the tree is a single folder level by construction — no multi-segment paths.
- Any `graphData.ts` / `server.ts` / `/api/graph` change; no engine change (stays Cytoscape).

## Design

### View toggle (`index.html` + `app.js`)

A segmented control lives at the top of `#s-head`:

```html
<div id="viewtoggle">
  <button data-view="graph" class="active">Graph</button>
  <button data-view="tree">Tree</button>
</div>
```

`state.view` (`'graph' | 'tree'`, default `'graph'`) tracks the active view. Clicking a button that isn't already active sets `state.view`, updates the `.active` class, and calls `setView()`.

### Element construction & swap (`app.js`)

`render()` is refactored so element construction is separated from Cytoscape setup:

- `buildGraphElements()` → returns the current wikilink elements (note nodes + link edges), i.e. today's `render()` element-building logic.
- `buildTreeElements()` → returns synthetic tree elements:
  - one **root** node `{ id: '__root__', label: <vault name or "vault">, isFolder: true }`;
  - one **folder** node per distinct non-empty `node.folder`, id `__folder__:<folder>`, `{ label: <folder>, isFolder: true }`;
  - every **note** node (reusing its real `id` and `...n` data, so selection/info/Color-by/filter resolve identically);
  - **containment edges**: root→folder for each folder; folder→note for notes whose `folder` is non-empty; root→note for notes whose `folder` is `''` (root-level notes, and `exists:false` gap nodes, which carry `folder: ''`).
- `setView()` → `cy.elements().remove()`, add the elements for `state.view`, run the matching layout (`cose` params as today for graph; `breadthfirst` with `{ directed: true, roots: '#__root__' }` for tree), then re-apply `recolor()` + `applyFilter()`, clear any stale selection, and `hidePanel()`.

`render()` calls `setView()` once at startup instead of building elements inline. Note ids are stable across views, so `cy.getElementById(noteId)` keeps working.

### Styling (`app.js` Cytoscape style + `style.css`)

- Add a Cytoscape style entry for folder nodes: `selector: 'node[?isFolder]'` → square shape (`'shape': 'round-rectangle'`), neutral fill (`--line`/grey), always-visible label, not sized by degree.
- Containment edges use a distinct light style (`selector: 'edge[?tree]'`) — thin, solid, low-contrast; no arrowheads needed (hierarchy is conveyed by layout).
- `#viewtoggle` CSS: two small segmented buttons, active one filled with the coral/navy accent; consistent with the sidebar.

### Interactions in tree view (reuse)

- **Note nodes:** the existing `cy.on('tap','node', …)` fires `focusNode` + `showPanel`. `showPanel` still lists wikilink in/out neighbors from `state.data.edges` — meaningful even in tree view. Note taps also drive selection → `updateFocus` highlight.
- **Folder/root nodes:** `isFolder` nodes are not notes; tapping one focuses it but `showPanel` is only wired for note taps — guard `showPanel`/the tap handler to ignore `isFolder` nodes (no info panel for folders).
- **Color-by:** `nodeColor` runs on note nodes as today; folder nodes are styled by the `isFolder` selector, unaffected by Color-by.
- **Filter:** `applyFilter` uses `groupKey(n.data())`; folder nodes have no group and are never in `state.hidden`, so `groupKey`/hidden must treat `isFolder` nodes as always-visible (return a sentinel that's never hidden). Note nodes hide exactly as in graph view.
- **Search/highlight:** `updateFocus` matches note labels/ids; folder nodes won't match. `closedNeighborhood` in tree view highlights containment-adjacent nodes — acceptable.

### Data flow

`/api/graph` already provides `nodes[].folder`, `id`, `title`, `type`/`status`/`freshness`/`exists`, and `edges` (wikilinks). No new data needed. `buildTreeElements` is a pure client-side transform of `state.data`.

## Error handling & edge cases

- **Flat vault** (every `folder === ''`, like the QA vault): the tree is root → all notes (depth 1). Valid; `breadthfirst` handles it.
- **Gap/missing nodes** (`exists:false`, `folder: ''`): hang directly off root alongside root-level notes; they keep their dashed gap styling from the node style.
- **Filter active when switching to tree:** `setView` re-applies `applyFilter`, so hidden groups stay hidden across the swap.
- **Live selection when switching views:** `setView` clears selection and calls `hidePanel()` to avoid a dangling selection over recreated elements.
- **`isFolder` in group logic:** `groupKey` returns a never-hidden sentinel for `isFolder` nodes; `showPanel` ignores them; this prevents folder nodes leaking into the filter rows/counts (which are built from `state.data.nodes`, not cy — so folder synth nodes never enter the counts anyway).

## Components touched

| File | Change |
|---|---|
| `index.html` | Add `#viewtoggle` (Graph/Tree buttons) at the top of `#s-head`. |
| `style.css` | `#viewtoggle` segmented-control styling (active = accent). |
| `app.js` | Add `state.view`; split `render` into `buildGraphElements`/`buildTreeElements`/`setView`; add folder/tree-edge Cytoscape styles; wire the toggle; guard `showPanel`/tap + `groupKey` against `isFolder` nodes. |

No backend or data-shape change.

## Verification

No frontend test harness (`app.js` is a non-module browser script), so verification is:

1. **Playwright on a built `dist`** against the sample vault, asserting:
   - Toggle: clicking `Tree` sets `state.view === 'tree'`, `.active` moves; the canvas now has folder node(s) (`node[?isFolder]`) and containment edges (`edge[?tree]`) and **no** wikilink edges; clicking `Graph` restores the wikilink graph.
   - Reuse in tree: clicking a note fills `#s-info`; Color-by still colors notes; unchecking a filter group hides those note nodes in the tree; search still dims/highlights.
   - Flat vault renders root → notes with no error; console clean.
2. **User visual sign-off** on the tree layout and toggle.

## Rollout

Single PR on `feat/viz-phase3-views`, stacked on the merged Phase 2. Per repo convention, update the `README.md` `cortex viz` line to mention the graph/tree view toggle. Phase 3b (Mermaid) is specced separately afterward.
