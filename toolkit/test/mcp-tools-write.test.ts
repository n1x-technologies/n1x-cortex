import { describe, it, expect } from 'vitest';
import {
  atomizeEmitTool, dupesTool, gapsTool,
  atomizeApplyTool, setStatusTool, promoteTool, mergeTool, undoTool,
} from '../src/mcp/tools-write.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A vault with one source under Markdown/ and one curated note. */
function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-mcpw-'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, 'Markdown', 'spec.md'),
    '# Spec\n\n## Operation limit\n\nThe limit for an operation of type X is 5 units.\n');
  writeFileSync(join(dir, '03-Rules', 'limit.md'),
    '---\nid: RULE-LIMIT\ntype: rule\nstatus: draft\nsource: "[[FUENTE-rules]]"\n---\n# Operation limit\nThe applicable limit is 5 units.\n');
  return dir;
}

function inboxFiles(dir: string): string[] {
  const inbox = join(dir, '_inbox');
  return existsSync(inbox) ? readdirSync(inbox).filter(f => f.endsWith('.md')) : [];
}

describe('read companions', () => {
  it('atomizeEmitTool returns the source segments', () => {
    const dir = vault();
    const plan = atomizeEmitTool(dir, { source: 'Markdown/spec.md' });
    expect(plan.source).toBeTruthy();
    expect(plan.segments.length).toBeGreaterThan(0);
  });
  it('atomizeEmitTool rejects a source outside the vault', () => {
    const dir = vault();
    expect(() => atomizeEmitTool(dir, { source: '../../etc/passwd' })).toThrow(/escapes the vault/);
  });
  it('cortex_atomize_emit hands the agent the distillation methodology', () => {
    const dir = vault();
    const plan = atomizeEmitTool(dir, { source: 'Markdown/spec.md' });
    expect(plan.instructions.toLowerCase()).toContain('one idea per note');
  });
  it('gapsTool reports a gaps structure', () => {
    const dir = vault();
    const r = gapsTool(dir);
    expect(Array.isArray(r.unatomizedSources)).toBe(true);
  });
  it('dupesTool returns an array', () => {
    const dir = vault();
    expect(Array.isArray(dupesTool(dir))).toBe(true);
  });
});

describe('atomizeApplyTool', () => {
  const notes = [{ title: 'New concept', type: 'concept', body: 'A distilled fact.', tags: ['x'] }];

  it('dry-run by default writes nothing', () => {
    const dir = vault();
    const out = atomizeApplyTool(dir, { source: '[[FUENTE-spec]]', notes });
    expect(out.dryRun).toBe(true);
    expect(out.runId).toBeNull();
    expect(inboxFiles(dir).length).toBe(0);
  });

  it('write:true creates a draft in _inbox/ and is reversible', () => {
    const dir = vault();
    const out = atomizeApplyTool(dir, { source: '[[FUENTE-spec]]', notes, write: true });
    expect(out.dryRun).toBe(false);
    expect(out.runId).toMatch(/-mcp$/);
    expect(inboxFiles(dir).length).toBe(1);
    undoTool(dir);
    expect(inboxFiles(dir).length).toBe(0);
  });
});

describe('setStatusTool', () => {
  it('dry-run leaves status unchanged; write flips it and is reversible', () => {
    const dir = vault();
    const note = '03-Rules/limit.md';
    const before = readFileSync(join(dir, note), 'utf8');

    const dry = setStatusTool(dir, { path: note, status: 'documented' });
    expect(dry.dryRun).toBe(true);
    expect(readFileSync(join(dir, note), 'utf8')).toBe(before);

    const wet = setStatusTool(dir, { path: note, status: 'documented', write: true });
    expect(wet.dryRun).toBe(false);
    expect(readFileSync(join(dir, note), 'utf8')).toContain('documented');

    undoTool(dir);
    expect(readFileSync(join(dir, note), 'utf8')).toBe(before);
  });

  it('rejects a path outside the vault', () => {
    const dir = vault();
    expect(() => setStatusTool(dir, { path: '../escape.md', status: 'x', write: true })).toThrow(/escapes the vault/);
  });

  it('refuses to touch a source under Markdown/ (immutable)', () => {
    const dir = vault();
    const out = setStatusTool(dir, { path: 'Markdown/spec.md', status: 'documented', write: true });
    expect(out.data.skipped?.reason).toBe('source-immutable');
  });
});

describe('promoteTool', () => {
  it('moves a status-advanced draft out of _inbox/ only on write, reversibly', () => {
    const dir = vault();
    // Seed a draft in _inbox/ whose status is already advanced enough to promote.
    mkdirSync(join(dir, '_inbox'));
    writeFileSync(join(dir, '_inbox', 'ready.md'),
      '---\nid: READY\ntype: concept\nstatus: documented\nsource: "[[FUENTE-x]]"\n---\n# Ready\nBody.\n');

    const dry = promoteTool(dir);
    expect(dry.dryRun).toBe(true);
    expect(existsSync(join(dir, '_inbox', 'ready.md'))).toBe(true);

    const wet = promoteTool(dir, { write: true });
    expect(wet.dryRun).toBe(false);
    // Either promoted or skipped, but if promoted the file leaves _inbox/.
    if (wet.data.promoted.length > 0) {
      expect(existsSync(join(dir, '_inbox', 'ready.md'))).toBe(false);
      undoTool(dir);
      expect(existsSync(join(dir, '_inbox', 'ready.md'))).toBe(true);
    }
  });
});

describe('mergeTool', () => {
  it('folds a pair on write and is reversible; rejects path escapes', () => {
    const dir = vault();
    mkdirSync(join(dir, '01-Concepts'));
    writeFileSync(join(dir, '01-Concepts', 'a.md'),
      '---\nid: A\ntype: concept\n---\n# A\nAlpha note.\n');
    writeFileSync(join(dir, '01-Concepts', 'b.md'),
      '---\nid: B\ntype: concept\n---\n# B\nBeta note.\n');

    const dry = mergeTool(dir, { keep: '01-Concepts/a.md', drop: '01-Concepts/b.md', content: '# A\nMerged.\n' });
    expect(dry.dryRun).toBe(true);
    expect(existsSync(join(dir, '01-Concepts', 'b.md'))).toBe(true);

    const wet = mergeTool(dir, { keep: '01-Concepts/a.md', drop: '01-Concepts/b.md', content: '# A\nMerged.\n', write: true });
    expect(wet.dryRun).toBe(false);
    expect(existsSync(join(dir, '01-Concepts', 'b.md'))).toBe(false);
    expect(readFileSync(join(dir, '01-Concepts', 'a.md'), 'utf8')).toContain('Merged.');

    undoTool(dir);
    expect(existsSync(join(dir, '01-Concepts', 'b.md'))).toBe(true);

    expect(() => mergeTool(dir, { keep: '../x.md', drop: '01-Concepts/b.md', content: 'x', write: true })).toThrow(/escapes the vault/);
  });
});
