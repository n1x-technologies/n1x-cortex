import { describe, it, expect } from 'vitest';
import { buildGraphData } from '../src/viz/graphData.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-viz-'));
  mkdirSync(join(dir, '01-Conceptos'));
  writeFileSync(join(dir, '01-Conceptos', 'a.md'), '---\ntipo: concepto\nestado: documentado\n---\n# A\n[[B]] [[Ghost]]');
  writeFileSync(join(dir, '01-Conceptos', 'b.md'), '---\ntipo: concepto\nestado: borrador\n---\n# B');
  writeFileSync(join(dir, '.cortex.json'), JSON.stringify({
    fields: { type: 'tipo', status: 'estado', id: 'id', source: 'source' },
    statusLifecycle: ['borrador', 'documentado', 'verificado'],
  }));
  return dir;
}

describe('buildGraphData', () => {
  it('emits nodes, edges, ghost orphans, and stats', () => {
    const dir = fixture();
    const cfg = loadConfig(dir, ['tipo', 'estado']);
    const data = buildGraphData(dir, cfg);

    const a = data.nodes.find(n => n.id === 'A');
    const b = data.nodes.find(n => n.id === 'B');
    const ghost = data.nodes.find(n => n.id === 'Ghost');

    expect(a?.exists).toBe(true);
    expect(a?.freshness).toBe('fresh');           // documentado, not draft/verified
    expect(b?.freshness).toBe('draft');           // borrador = first lifecycle stage
    expect(ghost?.exists).toBe(false);
    expect(ghost?.freshness).toBe('gap');

    expect(data.edges).toContainEqual({ source: 'A', target: 'B', context: null, dangling: false });
    expect(data.edges).toContainEqual({ source: 'A', target: 'Ghost', context: null, dangling: true });

    expect(data.stats.total).toBe(2);
    expect(data.stats.orphans).toBe(1);
    expect(data.stats.draftsPending).toBe(1);
    expect(typeof data.generatedAt).toBe('number');
  });
});
