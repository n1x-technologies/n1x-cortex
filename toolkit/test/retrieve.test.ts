import { describe, it, expect } from 'vitest';
import { retrieve } from '../src/query/retrieve.js';
import { buildGraph } from '../src/graph.js';
import type { Note } from '../src/types.js';

function note(p: Partial<Note>): Note {
  return { path: '', id: '', title: '', type: null, status: null, tags: [],
           meta: {}, folder: '', links: [], source: null, body: '', ...p };
}

describe('retrieve', () => {
  const notes = [
    note({ id: 'RULE-LIMIT', path: '03-Rules/limit.md', title: 'Operation limit', source: 'FUENTE-rules',
           body: 'The applicable limit for an operation of type X is 5 units.', links: [{ target: 'FLOW-PAY', heading: 'Relacionadas' }] }),
    note({ id: 'FLOW-PAY', path: '02-Flows/pay.md', title: 'Payment flow',
           body: 'Payment flow applies the operation limit before charging.', links: [] }),
    note({ id: 'NOISE', path: '01-Concepts/noise.md', title: 'Colors', body: 'Unrelated note about colors.', links: [] }),
  ];
  const graph = buildGraph(notes);

  it('anchors on the best match, pulls in linked notes, and cites sources', () => {
    const r = retrieve(notes, graph, 'what is the operation limit', { maxHits: 5 });
    expect(r.anchors).toContain('RULE-LIMIT');
    const ids = r.hits.map(h => h.id);
    expect(ids).toContain('RULE-LIMIT');
    expect(ids).toContain('FLOW-PAY');          // pulled in via the wikilink
    expect(ids).not.toContain('NOISE');
    const anchorHit = r.hits.find(h => h.id === 'RULE-LIMIT')!;
    expect(anchorHit.via).toBe('anchor');
    expect(anchorHit.excerpt).toContain('limit');
    expect(r.sources).toContain('03-Rules/limit.md');
    expect(r.sources).toContain('FUENTE-rules');
    expect(r.question).toBe('what is the operation limit');
  });
});
