/* Cortex Viewer — fetches /api/graph and renders it with Cytoscape. */
const TYPE_PALETTE = ['#4F9DDE', '#E94560', '#46C0A0', '#E0A458', '#9B7EDE', '#D86F9B', '#6FB36F', '#C8A24A'];
const FRESH = { gap: '#6e6e80', stale: '#db6d28', draft: '#d29922', verified: '#2ea043', fresh: '#46c0a0' };
const STATUS_FALLBACK = ['#8a8aa0', '#4F9DDE', '#2ea043', '#E0A458'];

const state = { data: null, mode: 'type', typeColors: {}, statusColors: {}, search: '', hoverNode: null };

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

let cy;
function render() {
  const nodeIds = new Set(state.data.nodes.map(n => n.id));
  const elements = [];
  for (const n of state.data.nodes) {
    elements.push({ data: { id: n.id, label: n.title, ...n } });
  }
  for (const e of state.data.edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
    elements.push({ data: { id: `${e.source}->${e.target}`, source: e.source, target: e.target, dangling: e.dangling } });
  }
  cy = cytoscape({
    container: document.getElementById('cy'),
    elements,
    layout: { name: 'cose', animate: false, nodeRepulsion: 6000, idealEdgeLength: 70 },
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
      { selector: '.faded', style: { 'opacity': 0.12, 'text-opacity': 0 } },
      { selector: '.spotlight', style: { 'text-opacity': 1 } },
    ],
  });
  cy.on('tap', 'node', (ev) => { const node = ev.target; focusNode(node); showPanel(node.data()); });
  cy.on('mouseover', 'node', (ev) => { state.hoverNode = ev.target; updateFocus(); });
  cy.on('mouseout', 'node', () => { state.hoverNode = null; updateFocus(); });
  cy.on('select unselect', 'node', () => updateFocus());
  cy.on('tap', (ev) => { if (ev.target === cy) { cy.$(':selected').unselect(); hidePanel(); updateFocus(); } });
}

function recolor() {
  if (!cy) return;
  cy.batch(() => cy.nodes().forEach(n => n.style('background-color', nodeColor(n.data()))));
  buildLegend();
}

function focusNode(node) {
  if (!cy || !node || node.empty()) return;
  const targetZoom = Math.max(cy.zoom(), 1.2); // never zoom out on focus; gently zoom in when far
  cy.animate(
    { center: { eles: node }, zoom: targetZoom },
    { duration: 350, easing: 'ease-out' }
  );
}

function showPanel(n) {
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('p-title').textContent = n.label || n.id;
  const meta = [['id', n.id], ['type', n.type], ['status', n.status], ['folder', n.folder], ['freshness', n.freshness], ['links', n.degree]];
  document.getElementById('p-meta').innerHTML = meta.filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const outgoing = state.data.edges.filter(e => e.source === n.id).map(e => e.target);
  document.getElementById('p-links').innerHTML = outgoing.length
    ? '<dt>connects to</dt>' + outgoing.slice(0, 25).map(t => `<a href="#" data-id="${t}">${t}</a>`).join('') : '';
  document.querySelectorAll('#p-links a').forEach(a => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    const node = cy.getElementById(a.dataset.id);
    if (node.nonempty()) { focusNode(node); node.select(); showPanel(node.data()); }
  }));
}
function hidePanel() { document.getElementById('panel').classList.add('hidden'); }

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

  const s = state.data.stats;
  document.getElementById('stats').textContent =
    `${s.total} notes · ${s.orphans} gaps · ${s.draftsPending} drafts · ${s.missingCitations} uncited`;

  render();
  buildLegend();

  document.getElementById('colorby').addEventListener('change', (e) => { state.mode = e.target.value; recolor(); });
  document.getElementById('search').addEventListener('input', (e) => applySearch(e.target.value));
  document.getElementById('panel-close').addEventListener('click', hidePanel);
}
main();
