// Drawing primitives for the README images, in the website's vocabulary:
//
//   RECTANGLE  a document. Closed, flat, one block.
//   RHOMBUS    a note. One idea, and the shape the brand is built on.
//   EDGE       a relation between two notes.
//   AGENT      a rhombus inside a rhombus, on a dotted tether.
//
// Everything is deterministic: the same seed gives the same constellation on
// every render, so re-rendering an image never reshuffles it.
(function () {
  const f = (n) => Math.round(n * 100) / 100;
  const ink = (a) => `rgba(var(--rgb),${a})`;
  const live = (a) => `rgba(var(--live),${a})`;

  function rng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  function diamond(x, y, r, fill) {
    return `<path d="M${f(x)} ${f(y - r)}L${f(x + r)} ${f(y)}L${f(x)} ${f(y + r)}L${f(x - r)} ${f(y)}Z" style="fill:${fill}"/>`;
  }

  function line(x1, y1, x2, y2, stroke, dash, width = 1) {
    const d = dash ? `stroke-dasharray:${dash};` : '';
    return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" style="stroke:${stroke};stroke-width:${width};${d}"/>`;
  }

  function path(points, stroke, width = 1) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('');
    return `<path d="${d}" style="fill:none;stroke:${stroke};stroke-width:${width}"/>`;
  }

  /** A document: a flat block with lines of text in it. `code` indents them. */
  function doc(x, y, w, h, { solid = 1, code = false } = {}) {
    let out = `<rect x="${f(x + 0.5)}" y="${f(y + 0.5)}" width="${f(w - 1)}" height="${f(h - 1)}" style="fill:${ink(0.06 * solid)};stroke:${ink(0.2 + 0.26 * solid)};stroke-width:1"/>`;
    const rows = 6;
    const inset = Math.round(w * 0.16);
    const indents = [0, 0.14, 0.28, 0.28, 0.14, 0];
    for (let r = 0; r < rows; r += 1) {
      const ry = y + inset + (r + 0.5) * ((h - inset * 2) / rows);
      const shift = code ? indents[r] * (w - inset * 2) : 0;
      const rw = (w - inset * 2) * (r === rows - 1 ? 0.56 : 0.86) - shift;
      out += `<rect x="${f(x + inset + shift)}" y="${f(ry)}" width="${f(rw)}" height="1" style="fill:${ink(0.32 * solid)}"/>`;
    }
    return out;
  }

  /** An agent: a rhombus holding a smaller one, on a short dotted tether. */
  function agent(x, y, r = 10) {
    return line(x, y + r + 9, x, y + r + 1, ink(0.3), '1 3')
      + diamond(x, y, r, ink(0.5))
      + diamond(x, y, r * 0.4, ink(0.78));
  }

  /**
   * The notes of a vault on a jittered grid (a plain grid reads as a lattice,
   * pure randomness clumps), dealt out to `docs` source documents, joined to
   * their nearest neighbours with at most `maxDeg` relations each.
   */
  function vault({ docs = 3, cols = 6, rows = 4, seed = 20260909, field, maxPx = 100, maxDeg = 4 }) {
    const rand = rng(seed);
    const slots = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        slots.push({ x: (c + 0.5) / cols + (rand() - 0.5) * 0.1, y: (r + 0.5) / rows + (rand() - 0.5) * 0.18, k: rand() });
      }
    }
    slots.sort((a, b) => a.k - b.k);
    const notes = slots.map((s, i) => ({
      doc: i % docs,
      x: field.x + (0.03 + s.x * 0.94) * field.w,
      y: field.y + (0.05 + s.y * 0.9) * field.h,
      r: 0.55 + rand() * 0.45,
    }));

    const pairs = [];
    for (let a = 0; a < notes.length; a += 1) {
      for (let b = a + 1; b < notes.length; b += 1) {
        pairs.push([a, b, Math.hypot(notes[a].x - notes[b].x, notes[a].y - notes[b].y)]);
      }
    }
    pairs.sort((p, q) => p[2] - q[2]);
    const degree = new Array(notes.length).fill(0);
    const edges = [];
    pairs.forEach(([a, b, d]) => {
      if (d > maxPx || degree[a] >= maxDeg || degree[b] >= maxDeg) return;
      degree[a] += 1;
      degree[b] += 1;
      edges.push([a, b]);
    });
    const adj = notes.map(() => []);
    edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
    return { notes, edges, adj };
  }

  /** Each agent enters at the note nearest its seat and walks real edges. */
  function walks(g, seats, hops = 3, seed = 4242) {
    const rand = rng(seed);
    const taken = new Set();
    return seats.map((seat) => {
      let at = 0;
      let best = Infinity;
      g.notes.forEach((n, i) => {
        if (taken.has(i)) return;
        const d = Math.hypot(n.x - seat.x, (n.y - seat.y) * 1.6);
        if (d < best) { best = d; at = i; }
      });
      taken.add(at);
      const walk = [at];
      for (let hop = 0; hop < hops; hop += 1) {
        const next = g.adj[at].filter((v) => !walk.includes(v));
        if (!next.length) break;
        at = next[Math.floor(rand() * next.length)];
        walk.push(at);
      }
      return { seat, walk };
    });
  }

  /** Relations, then the question paths in the live colour, then the notes on top. */
  function drawGraph(g, { paths = [], edgeAlpha = 0.2 } = {}) {
    let out = '';
    g.edges.forEach(([a, b]) => { out += line(g.notes[a].x, g.notes[a].y, g.notes[b].x, g.notes[b].y, ink(edgeAlpha)); });
    const lit = new Set();
    paths.forEach(({ seat, walk }) => {
      const pts = [[seat.x, seat.y], ...walk.map((i) => [g.notes[i].x, g.notes[i].y])];
      out += path(pts, live(0.7), 1.2);
      walk.forEach((i) => lit.add(i));
    });
    g.notes.forEach((n, i) => {
      const r = 2.4 + n.r * 2.6;
      out += lit.has(i) ? diamond(n.x, n.y, r + 1.6, live(0.95)) : diamond(n.x, n.y, r, ink(0.62));
    });
    return out;
  }

  window.N1X = { f, ink, live, rng, diamond, line, path, doc, agent, vault, walks, drawGraph };
})();
