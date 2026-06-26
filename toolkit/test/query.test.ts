import { describe, it, expect } from 'vitest';
import { runQuery, formatQuery } from '../src/commands/query.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-q-'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, '03-Rules', 'limit.md'),
    '---\nid: RULE-LIMIT\ntipo: regla\nfuente: "[[FUENTE-rules]]"\n---\n# Operation limit\nThe applicable limit for an operation of type X is 5 units.');
  return dir;
}

describe('runQuery', () => {
  it('returns a cited result for a question', () => {
    const r = runQuery(vault(), 'operation limit');
    expect(r.hits[0].id).toBe('RULE-LIMIT');
    expect(r.sources).toContain('03-Rules/limit.md');
  });
  it('formatQuery renders the question, a hit, and a Cite line', () => {
    const out = formatQuery(runQuery(vault(), 'operation limit'));
    expect(out).toMatch(/Operation limit/);
    expect(out).toMatch(/Cite:/);
    expect(out).toMatch(/03-Rules\/limit\.md/);
  });
});
