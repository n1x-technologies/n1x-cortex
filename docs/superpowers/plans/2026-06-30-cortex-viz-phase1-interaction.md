# Cortex `viz` UX Phase 1 — Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `cortex viz` graph viewer feel responsive — animated focus on click/navigation, a lit-up local neighborhood on hover/selection, and a bidirectional (incoming + outgoing) neighbor panel.

**Architecture:** Client-only changes to the two static viewer assets. All logic stays in Cytoscape (no engine migration, no new dependencies). A single `updateFocus()` function is the sole authority over element fading, so hover, selection, and search never fight over styles. View movement is centralized in `focusNode()`. Neighbor computation is a pure helper, `neighborsOf()`.

**Tech Stack:** Vanilla browser JS (`app.js` is a plain `<script>`, not an ES module), Cytoscape (vendored), CSS.

## Global Constraints

- **Files in scope:** ONLY `toolkit/src/viz/static/app.js` and `toolkit/src/viz/static/style.css`. Do not touch `graphData.ts`, `server.ts`, or the `/api/graph` payload.
- **Engine:** Stay on Cytoscape. Add no new libraries or vendor files.
- **Attribution/brand:** N1X Technologies; palette navy `#1A1A2E` / coral `#E94560` (already in `:root`). Do not introduce other palettes.
- **No client data:** any sample vault used for QA is throwaway and lives outside the repo (scratchpad). Never commit vault content.
- **Verification is manual browser QA.** The viewer has no frontend test harness (vitest covers `graphData.ts`, not the static assets), and `app.js` is a non-module browser script referencing `document`/`cytoscape` globals at load — so it cannot be imported into vitest without restructuring asset loading for what is otherwise trivial logic. Each task therefore ends with a concrete, observable browser check rather than an automated assertion.

---

## QA harness setup (do this once, before Task 1)

You need a small throwaway vault with interlinked notes — including a hub note and one dangling link — so the neighborhood/panel behavior is visible. Run the viewer with `tsx` so it serves live from `src/viz/static/` (edit a file, reload the browser, no build).

- [ ] **Create a sample vault in the scratchpad and initialize it**

```bash
REPO=/Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit
VAULT=/private/tmp/claude-501/-Users-wagnersebastian-Documents-0-WSDC-Tech-4-N1X-n1x-cortex/8b0b6fcf-d488-4509-b075-1cbaf1427868/scratchpad/qa-vault
mkdir -p "$VAULT" && cd "$VAULT"
npx tsx "$REPO/src/cli.ts" init
```

- [ ] **Add ~6 interlinked notes (a hub, a leaf, and a dangling link)**

Create these files under `$VAULT` (adjust the frontmatter keys if `cortex init` printed a different schema — the point is valid notes the scanner picks up):

```markdown
<!-- hub.md -->
---
title: Hub Note
type: concept
status: draft
---
Central note. Links to [[alpha]], [[beta]], [[gamma]], and a missing [[ghost]].
```

```markdown
<!-- alpha.md -->
---
title: Alpha
type: concept
status: draft
---
Alpha links back to [[hub]] and over to [[beta]].
```

```markdown
<!-- beta.md -->
---
title: Beta
type: concept
status: verified
---
Beta references [[gamma]].
```

```markdown
<!-- gamma.md -->
---
title: Gamma
type: source
status: draft
---
Leaf-ish note, links [[hub]].
```

- [ ] **Launch the viewer and confirm the baseline renders**

```bash
cd "$VAULT" && npx tsx "$REPO/src/cli.ts" viz
```

Expected: prints `Cortex viewer running at http://localhost:4317/`, opens a browser showing the graph with `hub` as the largest node (highest degree), a dashed/faded `ghost` gap node, and the header stats populated. Leave this running; after each code edit, just reload the browser tab.

---

## Task 1: Animated focus (`focusNode`)

**Files:**
- Modify: `toolkit/src/viz/static/app.js` (add `focusNode`; wire node-tap and neighbor-link handlers to it)

**Interfaces:**
- Produces: `focusNode(node)` — takes a Cytoscape node collection; animates `cy` to center it with a gentle zoom floor. No-ops on an empty collection. Consumed by Task 2 (selection flow) and Task 3 (panel neighbor links).

- [ ] **Step 1: Add the `focusNode` helper**

Add this function above `render()` in `app.js` (e.g. just after the `recolor()` function):

```js
function focusNode(node) {
  if (!cy || !node || node.empty()) return;
  const targetZoom = Math.max(cy.zoom(), 1.2); // never zoom out on focus; gently zoom in when far
  cy.animate(
    { center: { eles: node }, zoom: targetZoom },
    { duration: 350, easing: 'ease-out' }
  );
}
```

- [ ] **Step 2: Focus on node tap**

In `render()`, replace the existing node-tap handler:

```js
cy.on('tap', 'node', (ev) => showPanel(ev.target.data()));
```

with:

```js
cy.on('tap', 'node', (ev) => { const node = ev.target; focusNode(node); showPanel(node.data()); });
```

- [ ] **Step 3: Focus when a panel neighbor link is clicked**

In `showPanel()`, in the neighbor-link click handler, replace the instant recenter:

```js
if (node.nonempty()) { cy.center(node); node.select(); showPanel(node.data()); }
```

with the animated focus:

```js
if (node.nonempty()) { focusNode(node); node.select(); showPanel(node.data()); }
```

- [ ] **Step 4: Manual QA in the browser**

Reload the viewer tab. Verify:
- Clicking `hub` smoothly animates the view to center it over ~350ms; if you were zoomed far out, it zooms in to a readable level; if already close, it only re-centers (no jarring zoom jump).
- Clicking a neighbor in the side panel animates to that node the same way.
- Clicking a node while already centered on it does not throw or visibly jump.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/viz/static/app.js
git commit -m "feat(viz): animated focus on node tap and panel navigation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Neighborhood highlighting + unified dim state

**Files:**
- Modify: `toolkit/src/viz/static/app.js` (add `.faded`/`.spotlight` styles, `updateFocus`; refactor `applySearch`, hover/select/background handlers; extend `state`)

**Interfaces:**
- Consumes: `focusNode` (Task 1) is independent; not called here.
- Produces: `updateFocus()` — the single authority that decides which elements are faded. Precedence: transient hover > current selection > search term > nothing. Reads `state.hoverNode` and `state.search`; reads selection from `cy.$('node:selected')`. Consumed by all interaction handlers.

- [ ] **Step 1: Add fade/spotlight styles to the Cytoscape stylesheet**

In `render()`, add these two entries to the `style` array (after the `edge[?dangling]` entry):

```js
      { selector: '.faded', style: { 'opacity': 0.12, 'text-opacity': 0 } },
      { selector: '.spotlight', style: { 'text-opacity': 1 } },
```

- [ ] **Step 2: Extend `state` with the fields the new logic reads**

Change the `state` initializer near the top of `app.js`:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {} };
```

to:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null };
```

- [ ] **Step 3: Add the `updateFocus` authority function**

Add this function above `applySearch()` in `app.js`:

```js
function updateFocus() {
  if (!cy) return;
  const term = (state.search || '').trim().toLowerCase();
  const hover = state.hoverNode;
  const selected = cy.$('node:selected');

  let focus = null; // null = keep everything bright
  if (hover && hover.nonempty()) {
    focus = hover.closedNeighborhood();
  } else if (selected.nonempty()) {
    focus = selected.closedNeighborhood();
  } else if (term) {
    const matches = cy.nodes().filter(n =>
      (n.data('label') || '').toLowerCase().includes(term) || n.id().toLowerCase().includes(term));
    focus = matches.nonempty() ? matches.closedNeighborhood() : cy.collection();
  }

  cy.batch(() => {
    cy.elements().removeClass('faded spotlight');
    if (focus) {
      cy.elements().addClass('faded');
      focus.removeClass('faded');
      focus.nodes().addClass('spotlight');
    }
  });
}
```

- [ ] **Step 4: Replace `applySearch` to route through `updateFocus`**

Replace the entire `applySearch` function:

```js
function applySearch(q) {
  if (!cy) return;
  const term = q.trim().toLowerCase();
  cy.batch(() => cy.nodes().forEach(n => {
    if (n.selected()) { n.style('opacity', 1); n.style('text-opacity', 1); return; }
    const hit = !term || (n.data('label') || '').toLowerCase().includes(term) || n.id.toLowerCase().includes(term);
    n.style('opacity', hit ? 1 : 0.12);
    n.style('text-opacity', hit && term ? 1 : 0);
  }));
}
```

with:

```js
function applySearch(q) {
  state.search = q;
  updateFocus();
}
```

- [ ] **Step 5: Wire hover, selection, and background handlers**

In `render()`, after the existing `cy.on('tap', 'node', ...)` line, add hover and selection listeners:

```js
  cy.on('mouseover', 'node', (ev) => { state.hoverNode = ev.target; updateFocus(); });
  cy.on('mouseout', 'node', () => { state.hoverNode = null; updateFocus(); });
  cy.on('select unselect', 'node', () => updateFocus());
```

Then replace the background-tap handler:

```js
cy.on('tap', (ev) => { if (ev.target === cy) hidePanel(); });
```

with one that also clears selection and re-computes fading:

```js
cy.on('tap', (ev) => { if (ev.target === cy) { cy.$(':selected').unselect(); hidePanel(); updateFocus(); } });
```

- [ ] **Step 6: Manual QA in the browser**

Reload the tab. Verify:
- **Hover:** hovering `hub` fades everything except `hub`, its neighbors (`alpha`, `beta`, `gamma`, `ghost`), and the connecting edges; the neighborhood labels become readable. Moving the cursor off restores the previous state.
- **Selection persistence:** clicking `alpha` keeps `alpha`'s neighborhood lit after the cursor leaves; it stays lit until you click empty canvas, which clears it and closes the panel.
- **Search + hover interplay:** type `beta` in search (its neighborhood stays bright, the rest faded); now hover `gamma` → preview `gamma`'s neighborhood; move off → the view returns to the `beta`-search state with nothing stuck faded.
- No element is ever left permanently dimmed after clearing search, selection, and hover.

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/viz/static/app.js
git commit -m "feat(viz): neighborhood highlighting via a single updateFocus authority

Hover, selection, and search now route through one function so they no
longer clobber each other's fading. Fading is class-driven (.faded/.spotlight).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Bidirectional neighbor panel

**Files:**
- Modify: `toolkit/src/viz/static/app.js` (add `neighborsOf`, `esc`, `linkList`; build `state.titleById`; rewrite the panel links section)
- Modify: `toolkit/src/viz/static/style.css` (add `.more` hint style)

**Interfaces:**
- Consumes: `focusNode` (Task 1) for neighbor-link navigation; `updateFocus` (Task 2) fires via the `select` event when a neighbor link selects a node.
- Produces: `neighborsOf(edges, id)` → `{ outgoing: string[], incoming: string[] }` (pure). `state.titleById` — a `Map<id, title>` for rendering neighbor names.

- [ ] **Step 1: Add the pure `neighborsOf` helper and an HTML-escape helper**

Add above `showPanel()` in `app.js`:

```js
function neighborsOf(edges, id) {
  const outgoing = edges.filter(e => e.source === id).map(e => e.target);
  const incoming = edges.filter(e => e.target === id).map(e => e.source);
  return { outgoing, incoming };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
```

- [ ] **Step 2: Build the `id → title` map once, after data loads**

In `main()`, right after `state.statusColors = assignColors(statuses, STATUS_FALLBACK);`, add:

```js
  state.titleById = new Map(state.data.nodes.map(n => [n.id, n.title || n.id]));
```

- [ ] **Step 3: Add the `linkList` renderer**

Add above `showPanel()` in `app.js`:

```js
function linkList(label, ids) {
  if (!ids.length) return '';
  const shown = ids.slice(0, 25);
  const links = shown.map(t => `<a href="#" data-id="${esc(t)}">${esc(state.titleById.get(t) || t)}</a>`).join('');
  const more = ids.length > 25 ? `<div class="more">+${ids.length - 25} more</div>` : '';
  return `<dt>${label}</dt>${links}${more}`;
}
```

- [ ] **Step 4: Rewrite the panel links section in `showPanel`**

Replace this block in `showPanel()`:

```js
  const outgoing = state.data.edges.filter(e => e.source === n.id).map(e => e.target);
  document.getElementById('p-links').innerHTML = outgoing.length
    ? '<dt>connects to</dt>' + outgoing.slice(0, 25).map(t => `<a href="#" data-id="${t}">${t}</a>`).join('') : '';
```

with:

```js
  const { outgoing, incoming } = neighborsOf(state.data.edges, n.id);
  document.getElementById('p-links').innerHTML =
    linkList('connects to', outgoing) + linkList('linked from', incoming);
```

(Leave the subsequent `document.querySelectorAll('#p-links a')...` handler as updated in Task 1 — it already calls `focusNode`.)

- [ ] **Step 5: Add the `.more` hint style**

In `style.css`, append:

```css
#p-links .more { color: var(--muted); font-size: 11px; margin: 2px 0 8px; }
```

- [ ] **Step 6: Manual QA in the browser**

Reload the tab. Verify:
- Click `hub`: panel shows a **connects to** list (`Alpha`, `Beta`, `Gamma`, `ghost`) and, if anything links back, a **linked from** list — both showing note **titles**, not raw ids.
- Click `beta`: **linked from** shows `Hub` and `Alpha` (they link to it); **connects to** shows `Gamma`. Clicking any entry animates focus, selects it, lights its neighborhood, and refreshes the panel to that node.
- A note title containing `<`, `&`, or `"` renders literally (no broken markup). (Optional: temporarily set a title like `A & B <x>` in the vault to confirm, then revert.)
- On a node with >25 outgoing links a `+N more` line appears (only reproducible on a large vault; skip if the sample has none).

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/viz/static/app.js toolkit/src/viz/static/style.css
git commit -m "feat(viz): bidirectional neighbor panel (connects to / linked from)

Panel now lists incoming and outgoing neighbors by note title, HTML-escaped,
with a +N more hint on hub nodes. Extracts pure neighborsOf() helper.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final: README + PR

- [ ] **Update README if it describes viewer interactions**

Per repo convention (README updated on every push), grep `README.md` for the `cortex viz` section and, if it describes click/hover/panel behavior, update it to mention animated focus, neighborhood highlighting, and the bidirectional panel. If it only lists `viz` as a command with no interaction detail, no change is needed — note that in the PR description.

```bash
grep -n "viz" /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/README.md
```

- [ ] **Push and open the PR**

```bash
git push -u origin feat/viz-phase1-interaction
gh pr create --fill
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Goal 1 (animated focus) → Task 1. ✅
- Goal 2 (neighborhood highlighting, hover + persistent selection, unified with search) → Task 2 (`updateFocus` precedence hover > selection > search). ✅
- Goal 3 (incoming + outgoing neighbors, titled, clickable, `+N more`) → Task 3. ✅
- Spec edge cases: dangling/gap nodes (`focusNode` empty-guard + `neighborsOf` targets a non-existent id → link no-ops via existing `node.nonempty()` guard); deduped edges (handled upstream in `graphData.ts`); hub slicing (`linkList` 25 + `+N more`); hover/animation independence (transform vs class). ✅
- Non-goals (grouping, sidebar redesign, tree/Mermaid, backend changes) — none introduced. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every verification step lists concrete expected observations. ✅

**Type consistency:** `focusNode(node)`, `updateFocus()`, `neighborsOf(edges, id) → {outgoing, incoming}`, `linkList(label, ids)`, `esc(s)`, `state.search`, `state.hoverNode`, `state.titleById` are named identically everywhere referenced. The `.faded`/`.spotlight` class names match between the stylesheet entries (Task 2 Step 1) and `updateFocus` (Task 2 Step 3). ✅
