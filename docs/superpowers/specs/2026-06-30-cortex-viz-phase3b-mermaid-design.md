# Cortex `viz` — UX Phase 3b: Mermaid architecture (design)

**Date:** 2026-06-30
**Status:** Approved for planning
**Scope:** `toolkit/src/viz/static/index.html`, `style.css`, `app.js` only. No backend/server/`/api/graph` change. Builds on Phases 1–4 (sidebar, filter, Graph/Tree toggle, live forces), now on `main`.

## Background & decision

Phase 3 was split into 3a (folder tree, shipped) and 3b (this: a Mermaid architecture view). Rendering Mermaid in-browser would vendor `mermaid.min.js` (**3.6 MB** — ~8× the current viewer assets), which fights Cortex's light-install property. Decision: **generate copyable Mermaid source text, do not render it** — zero dependencies, zero shipped weight, and on-brand for Cortex (a shareable, agent-consumable artifact). The user pastes the source into any Mermaid renderer, a README, Obsidian, or docs.

## Goals

1. A third view in the toggle — `Graph | Tree | Mermaid` — that swaps the canvas for a text panel showing generated Mermaid `flowchart` source, with a **Copy** button.
2. The source groups notes by folder (`subgraph` per folder) and renders wikilinks as edges, using safe synthetic ids so any note title/id is valid Mermaid.
3. No new dependency; no backend change; Phases 1–4 unaffected.

## Non-goals (deferred)

- Rendering Mermaid in-browser (would require the 3.6 MB vendor).
- Folder-level aggregation (v1 is note-level grouped by folder; aggregation is a possible future phase if big-vault output is unwieldy).
- Respecting the tri-state filter (v1 reflects the whole vault, always).
- Any `graphData.ts` / `server.ts` / `/api/graph` change.

## Design

### View toggle & layout (`index.html`)

- Add a third button to `#viewtoggle`: `<button data-view="mermaid">Mermaid</button>`.
- Add a `#mermaid-view` container as a sibling of `#cy` inside `<main>`, hidden by default:
  ```html
  <div id="mermaid-view" class="hidden">
    <button id="mermaid-copy">Copy</button>
    <pre id="mermaid-src"></pre>
  </div>
  ```
- `state.view` becomes `'graph' | 'tree' | 'mermaid'`.

### `setView()` handling of `'mermaid'`

`setView()` gains a mermaid branch:
- `stopSim()` (no d3-force sim in mermaid view).
- Hide `#cy`, show `#mermaid-view` (toggle a `.hidden` class on each); for graph/tree, show `#cy` and hide `#mermaid-view`.
- Hide `#s-forces` (already hidden for tree; hidden for mermaid too — forces are graph-only).
- Populate `#mermaid-src` textContent with `buildMermaid()`.
- Do NOT run a Cytoscape layout or `startSim()` in mermaid view; the graph elements can stay as-is off-screen (they're just hidden with `#cy`).

The existing graph/tree branches are unchanged except that they must also ensure `#cy` is shown and `#mermaid-view` hidden (so toggling back restores the canvas + restarts the sim in graph).

### `buildMermaid()` — pure source generator (`app.js`)

Returns a Mermaid `flowchart LR` string from `state.data`:

- **Ids:** assign each note a synthetic id `n0`, `n1`, … (index-based `Map<noteId, mermaidId>`), so titles/ids with spaces or punctuation never break Mermaid syntax.
- **Labels:** `nX["<title>"]`, with the title Mermaid-escaped — replace `"` with `#quot;` and strip/replace characters Mermaid mishandles in quoted labels (backticks, newlines). Fall back to the note id when no title.
- **Grouping:** for each distinct non-empty `folder`, emit `subgraph f<k>["<folder>"]` … `end` containing the nodes whose `folder` matches; notes with empty folder (and `exists:false` gaps) are declared at top level (outside any subgraph).
- **Gap nodes** (`exists:false`) are included and marked — declared with a distinct shape/suffix (e.g. label `"<id> (missing)"`) so dangling links are visible.
- **Edges:** for each wikilink whose endpoints are both in the id map, emit `nX --> nY`.
- Node declarations precede edges; the whole thing is deterministic (stable order = the order of `state.data.nodes`/`edges`).

### Copy button (`app.js`)

`#mermaid-copy` click → `navigator.clipboard.writeText(document.getElementById('mermaid-src').textContent)`; on success briefly set the button text to "Copied", restoring it after ~1.2 s. Guard for the (rare) absence of `navigator.clipboard` — if unavailable, select the `<pre>` text as a fallback and leave a "Select + ⌘C" hint (best-effort; not blocking).

### Styling (`style.css`)

- `#mermaid-view` fills the main area (like `#cy`): flex column, `overflow: auto`, padded, `background: var(--bg)`.
- `#mermaid-src`: monospace, small, wrapped/scrollable, muted-ish text on the dark background.
- `#mermaid-copy`: small branded button (coral accent), top-right of the panel.
- `.hidden { display: none }` reused (a plain DOM class; note the Cytoscape `.hidden` class is separate and only applies to graph elements).

### Interplay with Phases 1–4

- **Sim:** `stopSim()` on entering mermaid; returning to graph re-runs `startSim()` via the graph branch.
- **Filter/color-by/search/forces:** inert in mermaid view (the source reflects the whole vault); those sidebar sections remain visible but have no effect. `#s-forces` is hidden (graph-only).
- **Info panel:** unchanged; no node selection happens in mermaid view.
- **Tree/graph views:** unchanged apart from also toggling `#cy`/`#mermaid-view` visibility.

## Error handling & edge cases

- **Empty vault / no folders:** `flowchart LR` with top-level nodes only (no subgraphs); valid Mermaid.
- **Titles with quotes/newlines/backticks:** escaped/stripped so the quoted label stays valid.
- **Gap nodes with no folder:** declared top level, marked "(missing)".
- **Clipboard unavailable (non-secure context):** fallback to selecting the `<pre>` text; never throws.
- **Large vault:** the source may be long; it is plain text in a scrollable `<pre>` — acceptable (copy-and-render elsewhere). Noted as a future aggregation candidate, not handled here.
- **Filter active when switching to Mermaid:** ignored by design — the source always reflects the full vault.

## Components touched

| File | Change |
|---|---|
| `index.html` | Add the `Mermaid` toggle button; add `#mermaid-view` (Copy button + `#mermaid-src`) in `<main>`. |
| `style.css` | `#mermaid-view` / `#mermaid-src` / `#mermaid-copy` styling (branded, existing palette). |
| `app.js` | Add `buildMermaid()`; handle `state.view === 'mermaid'` in `setView` (stop sim, swap `#cy`/`#mermaid-view`, populate source); wire the Copy button; extend the toggle to three views. |

No backend or data-shape change; `/api/graph` already provides `nodes[].folder/title/id/exists` and `edges`.

## Verification

No frontend test harness (`app.js` is a non-module browser script), so verification is:

1. **Playwright on a built `dist`** against the sample vault (with a `concepts/` subfolder), asserting:
   - Toggling `Mermaid` sets `state.view === 'mermaid'`, hides `#cy`, shows `#mermaid-view`, and `#s-forces` is hidden.
   - `#mermaid-src` text starts with `flowchart`, contains a `subgraph` for the `concepts` folder, one node declaration per note (synthetic ids), a `(missing)` marker for the gap node, and `-->` edges matching the wikilinks.
   - The generated source satisfies structural invariants: balanced `subgraph`/`end` counts, every `-->` endpoint id is declared, and no unescaped `"` inside a label (Mermaid isn't vendored, so validation is structural, not a real parse).
   - Clicking Copy writes the source to the clipboard (assert via `navigator.clipboard.readText()` in the test context) and flips the label to "Copied".
   - Toggling back to `Graph` shows `#cy`, hides `#mermaid-view`, and restarts the sim.
   - Console clean.
2. **User visual sign-off** on the panel + copied source pasted into a Mermaid renderer.

## Rollout

Single PR on `feat/viz-phase3b-mermaid`, stacked on merged Phase 4. Per repo convention, update the `README.md` `cortex viz` line to mention the Mermaid architecture export. This completes the planned viewer rework (Phases 1–4 + 3a/3b).
