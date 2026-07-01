# Cortex `viz` UX Phase 3b — Mermaid Architecture Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `Mermaid` view to the `cortex viz` toggle that shows generated, copyable Mermaid `flowchart` source for the vault (folders as subgraphs, wikilinks as edges) — no renderer vendored.

**Architecture:** Client-only, one task. `buildMermaid()` is a pure string generator over `state.data`. `setView()` gains a `'mermaid'` branch that stops the sim, swaps the canvas (`#cy`) for a text panel (`#mermaid-view`), and fills it. A Copy button writes the source to the clipboard.

**Tech Stack:** Vanilla browser JS (`app.js` is a plain `<script>`, not an ES module), HTML, CSS. No Mermaid dependency (text only).

## Global Constraints

- **Files in scope:** ONLY `toolkit/src/viz/static/{index.html,style.css,app.js}`. No `graphData.ts`/`server.ts`/`/api/graph` change.
- **No new dependency** — Mermaid is NOT vendored; we emit source text only. `app.js` stays a plain browser `<script>` (no import/export).
- **Palette:** existing `:root` vars; Copy button uses `var(--coral)`. No new colors.
- **Content:** `flowchart LR`; one `subgraph` per non-empty `folder` containing its notes; root-folder notes and `exists:false` gaps at top level; gaps marked `(missing)`; synthetic ids `n0,n1,…` with quoted, escaped labels; wikilinks as `nX --> nY` (only when both endpoints exist in the id map). Reflects the WHOLE vault — the tri-state filter is ignored by design.
- **Preserve Phases 1–4:** graph/tree/forces/filter/search/panel unchanged; the sim is stopped in mermaid view and restarted when returning to graph.
- **Verification is manual QA by design.** No frontend test harness; `app.js` is a non-module browser script. Gate is `node --check`; functional/visual verification (Playwright on a built `dist` + human sign-off) is done by the controller.

## QA harness (controller runs this)

```bash
cd /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit && npm run build
cd <qa-vault> && node /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/dist/cli.js viz
```
The QA vault has a `concepts/` subfolder (note `delta`) plus root notes and a dangling `ghost`, so it exercises a subgraph, root-level nodes, and a gap.

---

## Task 1: Mermaid view — generator, toggle, panel, copy

**Files:**
- Modify: `toolkit/src/viz/static/index.html` (Mermaid toggle button; `#mermaid-view` panel)
- Modify: `toolkit/src/viz/static/style.css` (generic `.hidden`; mermaid panel styling)
- Modify: `toolkit/src/viz/static/app.js` (`mmEsc`, `buildMermaid`, `setView` mermaid branch, Copy wiring)

**Interfaces:**
- Produces: `buildMermaid()` → Mermaid `flowchart LR` string from `state.data`; `mmEsc(s)` → label-safe string. DOM ids `#mermaid-view`, `#mermaid-src`, `#mermaid-copy`; toggle button `data-view="mermaid"`. `state.view` now also takes `'mermaid'` (no state-shape change — it's a string).

- [ ] **Step 1: Add the Mermaid toggle button in `index.html`**

Replace this exact block:

```html
        <div id="viewtoggle">
          <button data-view="graph" class="active">Graph</button>
          <button data-view="tree">Tree</button>
        </div>
```

with:

```html
        <div id="viewtoggle">
          <button data-view="graph" class="active">Graph</button>
          <button data-view="tree">Tree</button>
          <button data-view="mermaid">Mermaid</button>
        </div>
```

- [ ] **Step 2: Add the `#mermaid-view` panel in `index.html`**

Replace this exact block:

```html
  <main>
    <div id="cy"></div>
    <aside id="sidebar">
```

with:

```html
  <main>
    <div id="cy"></div>
    <div id="mermaid-view" class="hidden">
      <button id="mermaid-copy">Copy</button>
      <pre id="mermaid-src"></pre>
    </div>
    <aside id="sidebar">
```

- [ ] **Step 3: Style the panel in `style.css`**

Append to `style.css`:

```css
.hidden { display: none; }
#mermaid-view { flex: 1; height: 100%; min-width: 0; overflow: auto; padding: 12px 16px; position: relative; }
#mermaid-copy { position: absolute; top: 12px; right: 16px; background: var(--coral); color: #fff;
  border: none; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
#mermaid-src { margin: 0; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ink); white-space: pre-wrap; word-break: break-word; }
```

- [ ] **Step 4: Add `mmEsc` + `buildMermaid` to `app.js`**

Add these two functions immediately above the `setView` function:

```js
function mmEsc(s) {
  return String(s).replace(/"/g, '#quot;').replace(/[\n\r`]/g, ' ').trim() || '(untitled)';
}

function buildMermaid() {
  const nodes = state.data.nodes;
  const idMap = new Map(nodes.map((n, i) => [n.id, 'n' + i]));
  const label = (n) => mmEsc((n.title || n.id) + (n.exists ? '' : ' (missing)'));
  const decl = (n) => `${idMap.get(n.id)}["${label(n)}"]`;
  const folders = new Map();
  for (const n of nodes) {
    const f = n.folder || '';
    (folders.get(f) || folders.set(f, []).get(f)).push(n);
  }
  const lines = ['flowchart LR'];
  let fi = 0;
  for (const [f, ns] of folders) {
    if (f === '') { ns.forEach(n => lines.push('  ' + decl(n))); continue; }
    lines.push(`  subgraph f${fi}["${mmEsc(f)}"]`);
    ns.forEach(n => lines.push('    ' + decl(n)));
    lines.push('  end');
    fi++;
  }
  for (const e of state.data.edges) {
    const s = idMap.get(e.source), t = idMap.get(e.target);
    if (s && t) lines.push(`  ${s} --> ${t}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 5: Handle `'mermaid'` in `setView()`**

Replace this exact function:

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

with:

```js
function setView() {
  if (!cy) return;
  document.getElementById('s-forces').style.display = state.view === 'graph' ? '' : 'none';
  document.getElementById('cy').classList.toggle('hidden', state.view === 'mermaid');
  document.getElementById('mermaid-view').classList.toggle('hidden', state.view !== 'mermaid');
  cy.$(':selected').unselect();
  hidePanel();
  stopSim();
  if (state.view === 'mermaid') {
    document.getElementById('mermaid-src').textContent = buildMermaid();
    return;
  }
  cy.elements().remove();
  cy.add(state.view === 'tree' ? buildTreeElements() : buildGraphElements());
  if (state.view === 'tree') { cy.$('[?isFolder]').unselectify(); cy.layout(TREE_LAYOUT).run(); }
  else { startSim(); }
  recolor();
  applyFilter();
}
```

- [ ] **Step 6: Wire the Copy button in `main()`**

In `main()`, immediately after the view-toggle wiring block (the `document.querySelectorAll('#viewtoggle button').forEach(...)` call that ends with `}));`), add:

```js
  document.getElementById('mermaid-copy').addEventListener('click', async () => {
    const btn = document.getElementById('mermaid-copy');
    const src = document.getElementById('mermaid-src').textContent;
    try {
      await navigator.clipboard.writeText(src);
      btn.textContent = 'Copied';
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('mermaid-src'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      btn.textContent = 'Select + ⌘C';
    }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
  });
```

- [ ] **Step 7: Syntax gate**

Run: `node --check /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/src/viz/static/app.js`
Expected: clean exit, no output.

(The view-toggle wiring already iterates all `#viewtoggle button`s, so the new Mermaid button needs no wiring change — do NOT edit that block.)

- [ ] **Step 8: Self-review**

`git diff` the three files. Confirm: the `Mermaid` toggle button and `#mermaid-view` (Copy + `#mermaid-src`) are present; `.hidden { display:none }` and mermaid styling added; `mmEsc` escapes `"`→`#quot;` and strips newlines/backticks with an `(untitled)` fallback; `buildMermaid` emits `flowchart LR`, one `subgraph f<k>["folder"]…end` per non-empty folder, top-level decls for root/gap notes, `(missing)` on `!exists`, and `nX --> nY` edges only when both endpoints are mapped; `setView` toggles `#cy`/`#mermaid-view` visibility, and in mermaid mode fills `#mermaid-src` and returns BEFORE touching cy elements/layout/sim; Copy wiring present. No Phase 1–4 logic altered beyond these sites.

- [ ] **Step 9: Commit**

```bash
git add toolkit/src/viz/static/index.html toolkit/src/viz/static/style.css toolkit/src/viz/static/app.js
git commit -m "feat(viz): Mermaid architecture view — copyable flowchart source

Adds a third Graph|Tree|Mermaid view that swaps the canvas for generated
Mermaid flowchart source (folders as subgraphs, wikilinks as edges, safe
synthetic ids, gaps marked) with a Copy button. No renderer vendored — text
only, zero deps. Reflects the whole vault.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification (after this task):** build, launch, Playwright assert: clicking `Mermaid` sets `state.view==='mermaid'`, hides `#cy`, shows `#mermaid-view`, and `#s-forces` is hidden; `#mermaid-src` text starts with `flowchart LR`, contains `subgraph f0["concepts"]`, one `nX["…"]` per note, a `(missing)` marker for `ghost`, and `-->` edges; structural invariants hold (equal `subgraph`/`end` counts; every `-->` endpoint declared; no raw `"` inside a label); clicking Copy sets the clipboard (assert via `navigator.clipboard.readText()`) and flips the label to `Copied`; toggling back to `Graph` shows `#cy`, hides `#mermaid-view`, restarts the sim; console clean. Then human sign-off pasting the source into a Mermaid renderer.

---

## Final: README + PR

- [ ] **Update the README `cortex viz` line** — change the ending `…, and live force controls (d3-force).` to `…, live force controls (d3-force), and a Mermaid architecture export.` (keep it one line).

```bash
grep -n "cortex viz" /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/README.md
```

- [ ] **Push and open the PR**

```bash
git push -u origin feat/viz-phase3b-mermaid
gh pr create --fill
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Third `Graph|Tree|Mermaid` toggle + canvas↔text swap → Step 1 (button), Step 2 (`#mermaid-view`), Step 5 (`setView` visibility toggle + return). ✅
- `buildMermaid` (folders as subgraphs, synthetic ids, escaped labels, gaps marked, wikilink edges) → Step 4. ✅
- Copy to clipboard with fallback → Step 6. ✅
- Reflects whole vault / ignores filter → `buildMermaid` reads `state.data` directly, no filter check. ✅
- Sim stopped in mermaid, restarted on graph → Step 5 (`stopSim()` before the mermaid return; graph branch `startSim()`). ✅
- Non-goals (no renderer/vendor, no aggregation, no filter-respect, no backend) — none introduced. ✅
- Edge cases: empty/rootless vault (top-level nodes, no subgraphs), quotes/newlines (`mmEsc`), gaps top-level+marked, clipboard-unavailable fallback, filter ignored. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; verification lists concrete observations. ✅

**Type consistency:** `mmEsc`/`buildMermaid`/`#mermaid-view`/`#mermaid-src`/`#mermaid-copy`/`data-view="mermaid"`/`state.view === 'mermaid'` named identically across steps; `setView` returns before cy work in mermaid so `startSim`/`recolor`/`applyFilter` never run on the hidden canvas; the `.hidden` DOM class (CSS `display:none`) is distinct from Cytoscape's `.hidden` node class (canvas-internal, no CSS). ✅
