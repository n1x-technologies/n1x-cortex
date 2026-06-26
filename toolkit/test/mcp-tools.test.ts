import { describe, it, expect } from 'vitest';
import { queryTool, getNoteTool } from '../src/mcp/tools.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-mcp-'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, '03-Rules', 'limit.md'),
    '---\nid: RULE-LIMIT\ntype: rule\nsource: "[[FUENTE-rules]]"\n---\n# Operation limit\nThe applicable limit for an operation of type X is 5 units.');
  return dir;
}

describe('queryTool', () => {
  it('returns cited hits and a sources list (lexical when no store)', async () => {
    const dir = vault();
    const out = await queryTool(dir, { question: 'operation limit' });
    expect(out.question).toBe('operation limit');
    expect(out.hits.length).toBeGreaterThan(0);
    const top = out.hits[0];
    expect(top.id).toBe('RULE-LIMIT');
    expect(top.path).toBe('03-Rules/limit.md');
    expect(typeof top.excerpt).toBe('string');
    expect(out.sources).toContain('03-Rules/limit.md');
  });
  it('respects maxHits', async () => {
    const dir = vault();
    const out = await queryTool(dir, { question: 'operation limit', maxHits: 1 });
    expect(out.hits.length).toBeLessThanOrEqual(1);
  });
});

describe('getNoteTool', () => {
  it('returns the full note by id', () => {
    const dir = vault();
    const n = getNoteTool(dir, { id: 'RULE-LIMIT' });
    expect(n.title).toBe('Operation limit');
    expect(n.path).toBe('03-Rules/limit.md');
    expect(n.body).toContain('5 units');
    expect(n.source).toBe('FUENTE-rules');
  });
  it('returns the full note by path', () => {
    const dir = vault();
    const n = getNoteTool(dir, { path: '03-Rules/limit.md' });
    expect(n.id).toBe('RULE-LIMIT');
  });
  it('throws a clear error when the note is not found', () => {
    const dir = vault();
    expect(() => getNoteTool(dir, { id: 'NOPE' })).toThrow(/not found: NOPE/);
  });
});
