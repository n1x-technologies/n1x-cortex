import { describe, it, expect, afterEach } from 'vitest';
import { startViz } from '../src/viz/server.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

let server: Server | undefined;
afterEach(() => server?.close());

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-srv-'));
  mkdirSync(join(dir, '01-Conceptos'));
  writeFileSync(join(dir, '01-Conceptos', 'a.md'), '---\nid: A\ntipo: concepto\n---\n# A');
  writeFileSync(join(dir, '.cortex.json'), JSON.stringify({
    fields: { type: 'tipo', status: 'estado', id: 'id', source: 'source' },
    statusLifecycle: ['borrador', 'documentado', 'verificado'],
  }));
  return dir;
}

describe('startViz', () => {
  it('serves /api/health and /api/graph on a free port', async () => {
    const out = await startViz(fixture(), 0);
    server = out.server;
    expect(out.url).toMatch(/^http:\/\/localhost:\d+\/$/);

    const health = await fetch(out.url + 'api/health');
    expect(await health.json()).toEqual({ ok: true });

    const graph = await fetch(out.url + 'api/graph');
    const data = await graph.json();
    expect(data.nodes.some((n: { id: string }) => n.id === 'A')).toBe(true);
    expect(data.stats.total).toBe(1);
  });
});

import { runViz } from '../src/commands/viz.js';

describe('runViz', () => {
  it('starts the viewer and returns a localhost url', async () => {
    const out = await runViz(fixture(), 0);
    server = out.server;
    expect(out.url).toMatch(/^http:\/\/localhost:\d+\/$/);
    const r = await fetch(out.url + 'api/health');
    expect(r.status).toBe(200);
  });
});
