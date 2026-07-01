# Cortex `viz` UX Phase 2 — Grouping/Filtering + Branded Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the `cortex viz` viewer into a persistent right sidebar (search / node info / Color-by + interactive tri-state group filter / stats), where unchecking a group hides those nodes.

**Architecture:** Client-only. Task 1 relocates the existing controls into a two-column sidebar layout with zero behavior change (Phase 1 focus/highlight/panel and the current legend all keep working). Task 2 turns the legend into an interactive tri-state filter driven by the active Color-by dimension. `groupKey(node)` is the single source of truth shared by the filter rows and the hide logic, so they can never disagree.

**Tech Stack:** Vanilla browser JS (`app.js` is a plain `<script>`, not an ES module), Cytoscape (vendored), HTML, CSS.

## Global Constraints

- **Files in scope:** ONLY `toolkit/src/viz/static/index.html`, `toolkit/src/viz/static/style.css`, `toolkit/src/viz/static/app.js`. Do not touch `graphData.ts`, `server.ts`, or the `/api/graph` payload.
- **Engine:** Stay on Cytoscape. No new libraries. `app.js` stays a plain browser `<script>` (no import/export).
- **Palette:** navy `#1A1A2E` / coral `#E94560` via the existing `:root` vars. No new colors beyond the existing greys/accents already in the file.
- **Preserve Phase 1:** `focusNode`, `updateFocus`, `neighborsOf`, `esc`, `linkList`, the hover/select/search wiring, and the in/out neighbor panel must keep working. Filtering (`display:none`) and highlighting (`.faded`/`.spotlight`, opacity) are orthogonal channels.
- **Stats reflect the whole vault**, not the filtered-visible subset (decided in the spec).
- **Verification is manual QA, by design.** The viewer has no frontend test harness and `app.js` is a non-module browser script that cannot be imported into vitest. Each implementer's automated gate is a **syntax check** (`node --check`); functional/visual verification (Playwright on a built `dist`, plus a human's visual sign-off) is done by the controller after the task. Implementers do NOT run a browser.

## QA harness (controller runs this after each task; implementers do not)

A sample vault already exists at
`/private/tmp/claude-501/-Users-wagnersebastian-Documents-0-WSDC-Tech-4-N1X-n1x-cortex/8b0b6fcf-d488-4509-b075-1cbaf1427868/scratchpad/qa-vault`
(hub/alpha/beta/gamma + a dangling `ghost`, mixed type/status). To view the built assets live:

```bash
cd /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit && npm run build
# then, from the vault dir:
cd <qa-vault> && node /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/dist/cli.js viz
```

The server serves `dist/viz/static` (which includes the vendored `cytoscape.min.js`) at `http://localhost:4317/`.

---

## Task 1: Two-column sidebar layout (behavior-preserving)

Move every existing control into a fixed right sidebar. No new features — the legend stays the current non-interactive color key. Deliverable: the viewer looks reorganized but behaves exactly as Phase 1 did.

**Files:**
- Modify (full rewrite): `toolkit/src/viz/static/index.html`
- Modify (full rewrite): `toolkit/src/viz/static/style.css`
- Modify: `toolkit/src/viz/static/app.js` (rework `showPanel`/`hidePanel` to a permanent info section; drop the panel-close listener)

**Interfaces:**
- Produces: DOM ids `#sidebar`, `#s-head`, `#s-info`, `#s-filter`, `#s-stats`, `#info-empty`; retains `#search`, `#colorby`, `#legend`, `#stats`, `#panel`, `#p-title`, `#p-meta`, `#p-links`. `showPanel(n)` fills `#s-info` (hides `#info-empty`, unhides `#panel`); `hidePanel()` reverts to the empty state. Task 2 consumes `#legend` and `#colorby`.

- [ ] **Step 1: Rewrite `index.html` to the two-column sidebar structure**

Replace the ENTIRE contents of `toolkit/src/viz/static/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cortex Viewer</title>
  <link rel="stylesheet" href="style.css" />
  <script src="vendor/cytoscape.min.js"></script>
</head>
<body>
  <main>
    <div id="cy"></div>
    <aside id="sidebar">
      <section id="s-head">
        <span class="brand">N1X&nbsp;Cortex</span>
        <input id="search" type="search" placeholder="Search notes…" />
      </section>
      <section id="s-info">
        <p id="info-empty" class="empty">Select a node to inspect it.</p>
        <div id="panel" class="hidden">
          <h2 id="p-title"></h2>
          <dl id="p-meta"></dl>
          <div id="p-links"></div>
        </div>
      </section>
      <section id="s-filter">
        <label class="colorby">Color by
          <select id="colorby">
            <option value="type">Type</option>
            <option value="status">Status</option>
            <option value="freshness">Freshness</option>
          </select>
        </label>
        <div id="legend"></div>
      </section>
      <section id="s-stats">
        <span id="stats" class="stats">loading…</span>
      </section>
    </aside>
  </main>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `style.css` for the two-column layout**

Replace the ENTIRE contents of `toolkit/src/viz/static/style.css` with:

```css
:root {
  --navy: #1A1A2E; --coral: #E94560; --bg: #11111b; --panel: #1c1c2b;
  --ink: #e8e8f2; --muted: #9a9ab5; --line: #2a2a40;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink);
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
main { display: flex; height: 100%; }
#cy { flex: 1; height: 100%; min-width: 0; }
#sidebar { width: 300px; flex: none; height: 100%; overflow-y: auto;
  background: var(--panel); border-left: 1px solid var(--line);
  display: flex; flex-direction: column; }
#sidebar section { padding: 12px 14px; border-bottom: 1px solid var(--line); }
#s-info { flex: 1; }
.brand { font-weight: 700; letter-spacing: .3px; display: block; margin-bottom: 8px; }
#search { width: 100%; background: #2a2a40; color: var(--ink); border: 1px solid var(--line);
  border-radius: 6px; padding: 6px 8px; font-size: 13px; }
.empty { color: var(--muted); font-size: 12px; margin: 0; }
#panel.hidden { display: none; }
#panel h2 { margin: 0 0 8px; font-size: 16px; }
#panel dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 0 0 10px; font-size: 12px; }
#panel dt { color: var(--muted); }
#panel a { color: #7db4ff; text-decoration: none; display: block; }
.colorby { color: var(--muted); font-size: 12px; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
#colorby { background: #2a2a40; color: var(--ink); border: 1px solid var(--line);
  border-radius: 6px; padding: 5px 8px; font-size: 13px; }
.stats { color: var(--muted); font-size: 12px; }
#legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; }
#legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%;
  vertical-align: middle; margin-right: 5px; }
#p-links .more { color: var(--muted); font-size: 11px; margin: 2px 0 8px; }
```

- [ ] **Step 3: Rework `showPanel`/`hidePanel` in `app.js` for the permanent info section**

Replace this exact block:

```js
function showPanel(n) {
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('p-title').textContent = n.label || n.id;
```

with (adds the empty-state toggle line):

```js
function showPanel(n) {
  document.getElementById('info-empty').style.display = 'none';
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('p-title').textContent = n.label || n.id;
```

Then replace this exact line:

```js
function hidePanel() { document.getElementById('panel').classList.add('hidden'); }
```

with:

```js
function hidePanel() {
  document.getElementById('panel').classList.add('hidden');
  document.getElementById('info-empty').style.display = '';
}
```

- [ ] **Step 4: Drop the panel-close listener in `main()`**

The close button no longer exists. Delete this exact line from `main()`:

```js
  document.getElementById('panel-close').addEventListener('click', hidePanel);
```

- [ ] **Step 5: Syntax gate**

Run: `node --check /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/src/viz/static/app.js`
Expected: clean exit, no output.

- [ ] **Step 6: Self-review**

`git diff` the three files. Confirm: `#bar` is gone; the sidebar has the four sections in order; `#search`/`#colorby`/`#legend`/`#stats`/`#panel` ids are preserved (so the existing `main()` wiring still binds); `showPanel`/`hidePanel` toggle `#info-empty`; the `panel-close` listener is removed; no other JS logic changed.

- [ ] **Step 7: Commit**

```bash
git add toolkit/src/viz/static/index.html toolkit/src/viz/static/style.css toolkit/src/viz/static/app.js
git commit -m "feat(viz): two-column layout — controls move into a right sidebar

Removes the top bar; search, node info, Color-by/legend, and stats now
stack in a persistent right sidebar. Node info is a permanent section with
an empty state instead of a floating dismissible panel. Behavior-preserving:
Phase 1 focus/highlight/in-out panel unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification (after this task):** build `dist`, launch on the QA vault, and via Playwright assert: `#sidebar` exists and `#bar` does not; the four sections appear in order; clicking `hub` hides `#info-empty` and fills `#panel` inside `#s-info`; a background tap restores `#info-empty`; Phase 1 focus/highlight still fire; console clean (favicon 404 ignored).

---

## Task 2: Interactive tri-state group filter

Turn `#legend` into a filter: one row per group of the active Color-by dimension, plus a tri-state **All**. Unchecking a group hides its nodes.

**Files:**
- Modify: `toolkit/src/viz/static/app.js` (add `hidden` to `state`; add `groupKey`/`groupColor`/`groupLabel`/`currentGroups`/`applyFilter`; replace `buildLegend` with `buildFilter`; add the `.hidden` Cytoscape style; reset filter on Color-by change; call `buildFilter` from `recolor` and `main`)
- Modify: `toolkit/src/viz/static/style.css` (filter-row styling; make `#legend` a vertical list)

**Interfaces:**
- Consumes: `state`, `esc`, `nodeColor`'s dimension logic, `#legend`, `#colorby` (Task 1).
- Produces: `groupKey(n)` → a stable string key for a node's group under the active mode (`'__gap__'` for `!exists`, `'__none__'` for a null type/status, else the freshness/status/type value). `applyFilter()` toggles the Cytoscape `.hidden` class from `state.hidden`. `buildFilter()` renders the tri-state list.

- [ ] **Step 1: Add `hidden` to `state`**

Replace this exact line:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null };
```

with:

```js
const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null, hidden: new Set() };
```

- [ ] **Step 2: Add the group helpers (single source of truth)**

Add these functions immediately above the current `buildLegend` function:

```js
function groupKey(n) {
  if (!n.exists) return '__gap__';
  if (state.mode === 'freshness') return n.freshness || 'fresh';
  const v = state.mode === 'status' ? n.status : n.type;
  return v || '__none__';
}

function groupColor(key) {
  if (key === '__gap__') return FRESH.gap;
  if (key === '__none__') return '#8a8aa0';
  if (state.mode === 'freshness') return FRESH[key] || FRESH.fresh;
  return (state.mode === 'status' ? state.statusColors : state.typeColors)[key] || '#8a8aa0';
}

const FRESH_LABEL = { verified: 'verified & in sync', draft: 'draft', stale: 'stale', fresh: 'fresh' };
function groupLabel(key) {
  if (key === '__gap__') return 'gap (missing)';
  if (key === '__none__') return '—';
  if (state.mode === 'freshness') return FRESH_LABEL[key] || key;
  return key;
}

function currentGroups() {
  const cnt = {};
  for (const n of state.data.nodes) { const k = groupKey(n); cnt[k] = (cnt[k] || 0) + 1; }
  let keys;
  if (state.mode === 'freshness') {
    keys = ['verified', 'draft', 'stale', 'fresh', '__gap__'].filter(k => k in cnt);
  } else {
    keys = Object.keys(cnt).filter(k => k !== '__gap__' && k !== '__none__').sort()
      .concat(['__none__', '__gap__'].filter(k => k in cnt));
  }
  return keys.map(k => ({ key: k, label: groupLabel(k), color: groupColor(k), count: cnt[k] }));
}
```

- [ ] **Step 3: Replace `buildLegend` with `buildFilter`**

Replace this entire function:

```js
function buildLegend() {
  const el = document.getElementById('legend');
  let entries;
  if (state.mode === 'freshness') {
    entries = [['verified & in sync', FRESH.verified], ['draft', FRESH.draft], ['stale', FRESH.stale], ['fresh', FRESH.fresh], ['gap (missing)', FRESH.gap]];
  } else if (state.mode === 'status') {
    entries = Object.entries(state.statusColors);
  } else {
    entries = Object.entries(state.typeColors);
  }
  el.innerHTML = entries.map(([k, c]) => `<span><span class="dot" style="background:${c}"></span>${k || '—'}</span>`).join('');
}
```

with:

```js
function buildFilter() {
  const el = document.getElementById('legend');
  const groups = currentGroups();
  const noneHidden = state.hidden.size === 0;
  const allHidden = groups.length > 0 && groups.every(g => state.hidden.has(g.key));
  const rows = groups.map(g =>
    `<label class="frow"><input type="checkbox" data-key="${esc(g.key)}" ${state.hidden.has(g.key) ? '' : 'checked'}>`
    + `<span class="dot" style="background:${g.color}"></span>`
    + `<span class="flabel">${esc(g.label)}</span>`
    + `<span class="fcount">${g.count}</span></label>`).join('');
  el.innerHTML =
    `<label class="frow fall"><input type="checkbox" id="filter-all" ${noneHidden ? 'checked' : ''}>`
    + `<span class="flabel">All</span></label>` + rows;
  const allBox = document.getElementById('filter-all');
  allBox.indeterminate = !noneHidden && !allHidden;
  allBox.addEventListener('change', () => {
    if (allHidden) state.hidden.clear();
    else groups.forEach(g => state.hidden.add(g.key));
    buildFilter(); applyFilter();
  });
  el.querySelectorAll('input[data-key]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) state.hidden.delete(cb.dataset.key); else state.hidden.add(cb.dataset.key);
    buildFilter(); applyFilter();
  }));
}

function applyFilter() {
  if (!cy) return;
  cy.batch(() => cy.nodes().forEach(n => {
    if (state.hidden.has(groupKey(n.data()))) n.addClass('hidden'); else n.removeClass('hidden');
  }));
}
```

- [ ] **Step 4: Add the `.hidden` Cytoscape style**

In `render()`, add this entry to the `style` array, immediately after the `.spotlight` entry:

```js
      { selector: '.hidden', style: { 'display': 'none' } },
```

- [ ] **Step 5: Point `recolor` at `buildFilter`**

In `recolor()`, replace `buildLegend();` with `buildFilter();`.

- [ ] **Step 6: Reset the filter on Color-by change, and call `buildFilter` from `main`**

In `main()`, replace this exact line:

```js
  render();
  buildLegend();
```

with:

```js
  render();
  buildFilter();
```

Then replace this exact line:

```js
  document.getElementById('colorby').addEventListener('change', (e) => { state.mode = e.target.value; recolor(); });
```

with (clear hidden groups — they don't carry across dimensions — then recolor rebuilds the filter and re-apply clears `.hidden`):

```js
  document.getElementById('colorby').addEventListener('change', (e) => {
    state.mode = e.target.value; state.hidden.clear(); recolor(); applyFilter();
  });
```

- [ ] **Step 7: Add filter-row styling to `style.css`**

In `style.css`, replace this exact rule:

```css
#legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; }
```

with (the filter is now a vertical list of rows):

```css
#legend { display: block; font-size: 12px; }
.frow { display: flex; align-items: center; gap: 6px; padding: 2px 0; cursor: pointer; }
.frow input { margin: 0; flex: none; }
.frow .flabel { flex: 1; }
.frow .fcount { color: var(--muted); font-size: 11px; }
.fall { font-weight: 600; border-bottom: 1px solid var(--line); margin-bottom: 4px; padding-bottom: 4px; }
```

- [ ] **Step 8: Syntax gate**

Run: `node --check /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/src/viz/static/app.js`
Expected: clean exit, no output.

- [ ] **Step 9: Self-review**

`git diff`. Confirm: `state.hidden` added; `groupKey` is used by BOTH `currentGroups` (row keys) and `applyFilter` (hide test) so they agree; `buildLegend` fully replaced; `.hidden` style present; `recolor`/`main` call `buildFilter`; Color-by change clears `state.hidden`; CSS `#legend` is now a block list with `.frow`. No Phase 1 function touched.

- [ ] **Step 10: Commit**

```bash
git add toolkit/src/viz/static/app.js toolkit/src/viz/static/style.css
git commit -m "feat(viz): interactive tri-state group filter in the sidebar

The legend becomes a filter over the active Color-by dimension: one row per
group (checkbox + dot + label + count) plus a tri-state All. Unchecking a
group hides its nodes (Cytoscape display:none, no layout reshuffle). groupKey
is the shared source of truth for rows and hiding; switching Color-by resets
the filter. Gap/missing nodes are their own hideable row.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification (after this task):** build `dist`, launch on the QA vault, and via Playwright assert: unchecking a group adds `.hidden`/`display:none` to exactly that group's nodes (by `groupKey`) and their edges disappear; re-checking restores them; `#filter-all` is `checked` with nothing hidden, `indeterminate` with a partial selection, and toggling it hides/shows everything; switching `Color-by` clears `state.hidden` and rebuilds rows for the new dimension; the `gap (missing)` row hides the `ghost` node; console clean. Then a human visual sign-off on the branded sidebar + filter.

---

## Final: README + PR

- [ ] **Update the README `cortex viz` line**

The Phase 1 line reads: `Local web viewer: interactive graph — search, color-by, animated focus, neighbor highlighting, and a bidirectional (in/out) link panel.` Extend it to mention the sidebar + group filtering, e.g. append `, plus a sidebar group filter.` Keep it one line.

```bash
grep -n "cortex viz" /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/README.md
```

- [ ] **Push and open the PR**

```bash
git push -u origin feat/viz-phase2-grouping
gh pr create --fill
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Two-column layout, sidebar with 4 ordered sections → Task 1 (index.html + style.css). ✅
- Node info becomes a permanent section with empty state; close button dropped → Task 1 Steps 3–4. ✅
- Tri-state group filter reusing Color-by; unchecking hides (`display:none`); All all/none/partial; reset on dimension change; gaps as own row; null → "—" → Task 2 (`groupKey`/`currentGroups`/`buildFilter`/`applyFilter`, Steps 1–7). ✅
- Stats reflect the vault (unchanged `#stats` text) — not recomputed on filter. ✅
- Orthogonality with Phase 1 (filter `display:none` vs highlight opacity; `updateFocus` untouched) — no Phase 1 function edited in either task. ✅
- Non-goals (clustering, folder axis, tree/Mermaid, backend) — none introduced. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; verification steps list concrete expected observations. ✅

**Type consistency:** `groupKey`, `groupColor`, `groupLabel`, `currentGroups`, `buildFilter`, `applyFilter`, `state.hidden`, the `.hidden` class, and ids `#legend`/`#colorby`/`#info-empty`/`#panel` are named identically across the tasks and match the Task 1 DOM. `buildFilter` replaces `buildLegend` everywhere it was called (`recolor`, `main`). ✅
