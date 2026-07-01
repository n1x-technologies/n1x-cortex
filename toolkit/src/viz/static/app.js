/* Cortex Viewer — fetches /api/graph and renders it with Cytoscape. */
const TYPE_PALETTE = ['#4F9DDE', '#E94560', '#46C0A0', '#E0A458', '#9B7EDE', '#D86F9B', '#6FB36F', '#C8A24A'];
const FRESH = { gap: '#6e6e80', stale: '#db6d28', draft: '#d29922', verified: '#2ea043', fresh: '#46c0a0' };
const STATUS_FALLBACK = ['#8a8aa0', '#4F9DDE', '#2ea043', '#E0A458'];

const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null, hidden: new Set(), view: 'graph', forces: { centre: 0.1, repel: 300, link: 0.5, distance: 40 } };

function assignColors(values, palette) {
  const map = {};
  values.forEach((v, i) => { map[v] = palette[i % palette.length]; });
  return map;
}

function nodeColor(n) {
  if (!n.exists) return FRESH.gap;
  if (state.mode === 'freshness') return FRESH[n.freshness] || FRESH.fresh;
  if (state.mode === 'status') return state.statusColors[n.status] || '#8a8aa0';
  return state.typeColors[n.type] || '#8a8aa0';
}

function groupKey(n) {
  if (n.isFolder) return '__folder__';
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
  // If the selected node was just hidden, drop the stale selection/panel so the
  // graph doesn't stay dimmed around an invisible spotlight center.
  const hiddenSelected = cy.$('node:selected').filter('.hidden');
  if (hiddenSelected.nonempty()) { hiddenSelected.unselect(); hidePanel(); }
  updateFocus();
}

let cy;
const AMBIENT_ALPHA = 0.02; // subtle perpetual motion; tunable

let d3ForceOk = false;
try {
  if (window.cytoscapeD3Force) { cytoscape.use(window.cytoscapeD3Force); d3ForceOk = true; }
} catch (e) { d3ForceOk = false; } // already-registered or missing: fall back to static cose

function graphLayout() {
  if (!d3ForceOk) {
    return { name: 'cose', animate: false, nodeRepulsion: 6000, idealEdgeLength: 70 };
  }
  return {
    name: 'd3-force', animate: true, infinite: true, fixedAfterDragging: false,
    linkId: (d) => d.id,
    linkDistance: state.forces.distance,
    linkStrength: state.forces.link,
    manyBodyStrength: -state.forces.repel,
    xStrength: state.forces.centre,
    yStrength: state.forces.centre,
    alphaTarget: AMBIENT_ALPHA, velocityDecay: 0.4,
  };
}

let graphSim = null;
function stopSim() { if (graphSim) { graphSim.stop(); graphSim = null; } }
function startSim() {
  if (!cy || state.view !== 'graph') return;
  stopSim();
  graphSim = cy.layout(graphLayout());
  graphSim.run();
}

let relayoutTimer;
function relayout() {
  if (state.view !== 'graph') return;
  clearTimeout(relayoutTimer);
  relayoutTimer = setTimeout(startSim, 120);
}

function buildGraphElements() {
  const nodeIds = new Set(state.data.nodes.map(n => n.id));
  const elements = [];
  for (const n of state.data.nodes) {
    elements.push({ data: { id: n.id, label: n.title, ...n } });
  }
  for (const e of state.data.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    elements.push({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target, dangling: e.dangling } });
  }
  return elements;
}

const TREE_LAYOUT = { name: 'breadthfirst', directed: true, roots: '#__root__', animate: false, spacingFactor: 1.1 };

function buildTreeElements() {
  const elements = [{ data: { id: '__root__', label: 'vault', isFolder: true } }];
  const folders = new Set();
  for (const n of state.data.nodes) {
    const f = n.folder || '';
    if (f && !folders.has(f)) {
      folders.add(f);
      elements.push({ data: { id: `__folder__:${f}`, label: f, isFolder: true } });
      elements.push({ data: { id: `__fedge__:${f}`, source: '__root__', target: `__folder__:${f}`, tree: true } });
    }
  }
  for (const n of state.data.nodes) {
    elements.push({ data: { id: n.id, label: n.title, ...n } });
    const parent = n.folder ? `__folder__:${n.folder}` : '__root__';
    elements.push({ data: { id: `__tedge__:${n.id}`, source: parent, target: n.id, tree: true } });
  }
  return elements;
}

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

function render() {
  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: [],
    style: [
      { selector: 'node', style: {
        'background-color': (n) => nodeColor(n.data()),
        'width': (n) => 8 + Math.min(28, (n.data('degree') || 0) * 1.4),
        'height': (n) => 8 + Math.min(28, (n.data('degree') || 0) * 1.4),
        'label': 'data(label)', 'font-size': 6, 'color': '#cfcfe6',
        'text-opacity': 0, 'min-zoomed-font-size': 8,
        'border-width': (n) => n.data('exists') ? 0 : 2,
        'border-style': 'dashed', 'border-color': '#8a8aa0',
        'background-opacity': (n) => n.data('exists') ? 1 : 0.25,
      }},
      { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#fff', 'border-style': 'solid', 'text-opacity': 1 } },
      { selector: 'edge', style: { 'width': 0.6, 'line-color': '#3a3a55', 'curve-style': 'haystack', 'opacity': 0.6 } },
      { selector: 'edge[?dangling]', style: { 'line-color': '#5a5a70', 'line-style': 'dashed' } },
      { selector: 'node[?isFolder]', style: {
        'shape': 'round-rectangle', 'background-color': '#2a2a40', 'background-opacity': 1,
        'border-width': 1, 'border-color': '#3a3a55', 'border-style': 'solid',
        'width': 'label', 'height': 16, 'padding': '4px',
        'label': 'data(label)', 'font-size': 8, 'color': '#cfcfe6', 'text-opacity': 1, 'text-valign': 'center',
      }},
      { selector: 'edge[?tree]', style: { 'width': 1, 'line-color': '#3a3a55', 'curve-style': 'bezier', 'opacity': 0.7, 'target-arrow-shape': 'none' } },
      { selector: '.faded', style: { 'opacity': 0.12, 'text-opacity': 0 } },
      { selector: '.spotlight', style: { 'text-opacity': 1 } },
      { selector: '.hidden', style: { 'display': 'none' } },
    ],
  });
  cy.on('tap', 'node', (ev) => { const node = ev.target; if (node.data('isFolder')) return; focusNode(node); showPanel(node.data()); });
  cy.on('mouseover', 'node', (ev) => { state.hoverNode = ev.target; updateFocus(); });
  cy.on('mouseout', 'node', () => { state.hoverNode = null; updateFocus(); });
  cy.on('select unselect', 'node', () => updateFocus());
  cy.on('tap', (ev) => { if (ev.target === cy) { cy.$(':selected').unselect(); hidePanel(); updateFocus(); } });
  setView();
}

function recolor() {
  if (!cy) return;
  cy.batch(() => cy.nodes().forEach(n => { if (n.data('isFolder')) return; n.style('background-color', nodeColor(n.data())); }));
  buildFilter();
}

function focusNode(node) {
  if (!cy || !node || node.empty()) return;
  const targetZoom = Math.max(cy.zoom(), 1.2); // never zoom out on focus; gently zoom in when far
  cy.animate(
    { center: { eles: node }, zoom: targetZoom },
    { duration: 350, easing: 'ease-out' }
  );
}

function neighborsOf(edges, id) {
  const outgoing = edges.filter(e => e.source === id).map(e => e.target);
  const incoming = edges.filter(e => e.target === id).map(e => e.source);
  return { outgoing, incoming };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function linkList(label, ids) {
  if (!ids.length) return '';
  const shown = ids.slice(0, 25);
  const links = shown.map(t => `<a href="#" data-id="${esc(t)}">${esc(state.titleById.get(t) || t)}</a>`).join('');
  const more = ids.length > 25 ? `<div class="more">+${ids.length - 25} more</div>` : '';
  return `<dt>${label}</dt>${links}${more}`;
}

function showPanel(n) {
  document.getElementById('info-empty').style.display = 'none';
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('p-title').textContent = n.label || n.id;
  const meta = [['id', n.id], ['type', n.type], ['status', n.status], ['folder', n.folder], ['freshness', n.freshness], ['links', n.degree]];
  document.getElementById('p-meta').innerHTML = meta.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const { outgoing, incoming } = neighborsOf(state.data.edges, n.id);
  document.getElementById('p-links').innerHTML =
    linkList('connects to', outgoing) + linkList('linked from', incoming);
  document.querySelectorAll('#p-links a').forEach(a => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    const node = cy.getElementById(a.dataset.id);
    if (node.nonempty()) { cy.$(':selected').unselect(); focusNode(node); node.select(); showPanel(node.data()); }
  }));
}
function hidePanel() {
  document.getElementById('panel').classList.add('hidden');
  document.getElementById('info-empty').style.display = '';
}

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

function applySearch(q) {
  state.search = q;
  updateFocus();
}

async function main() {
  let res;
  try {
    res = await fetch('api/graph');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.data = await res.json();
  } catch (err) {
    document.getElementById('stats').textContent = 'Error loading graph: ' + err.message;
    return;
  }
  const types = Object.keys(state.data.stats.byType);
  const statuses = Object.keys(state.data.stats.byStatus);
  state.typeColors = assignColors(types, TYPE_PALETTE);
  state.statusColors = assignColors(statuses, STATUS_FALLBACK);
  state.titleById = new Map(state.data.nodes.map(n => [n.id, n.title || n.id]));

  const s = state.data.stats;
  document.getElementById('stats').textContent =
    `${s.total} notes · ${s.orphans} gaps · ${s.draftsPending} drafts · ${s.missingCitations} uncited`;

  render();
  buildFilter();

  document.getElementById('colorby').addEventListener('change', (e) => {
    state.mode = e.target.value; state.hidden.clear(); recolor(); applyFilter();
  });
  document.getElementById('search').addEventListener('input', (e) => applySearch(e.target.value));
  document.querySelectorAll('#viewtoggle button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.view === state.view) return;
    state.view = b.dataset.view;
    document.querySelectorAll('#viewtoggle button').forEach(x => x.classList.toggle('active', x.dataset.view === state.view));
    setView();
  }));
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
  document.querySelectorAll('#s-forces input[data-force]').forEach(sl => sl.addEventListener('input', () => {
    state.forces[sl.dataset.force] = Number(sl.value);
    relayout();
  }));
}
main();
