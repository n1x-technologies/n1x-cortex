import { describe, it, expect } from 'vitest';
import { emitPlan } from '../src/atomize/emit.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-emit-'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '01-Concepts'));
  mkdirSync(join(dir, '03-Rules'));
  mkdirSync(join(dir, '_inbox'));
  writeFileSync(join(dir, '01-Concepts', 'a.md'), '---\ntype: concept\n---\n# Settlement');
  writeFileSync(join(dir, '03-Rules', 'b.md'), '---\ntype: rule\n---\n# Operation limit');
  writeFileSync(join(dir, '_inbox', 'old.md'), '---\ntype: draftish\n---\n# Old inbox note');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# Src\n\n## Topic A\n\nBody A.\n\n## Topic B\n\nBody B.');
  return dir;
}

describe('emitPlan', () => {
  it('emits segments, vault-discovered types/folders, statusFirst, and existing notes', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []); // default fields type/status/id/source; lifecycle ['draft','documented','verified']
    const plan = emitPlan(dir, join(dir, 'Markdown', 'src.md'), cfg);

    expect(plan.source).toBe('src');
    expect(plan.statusFirst).toBe('draft');
    expect(plan.segments.map(s => s.heading)).toEqual(['Src', 'Topic A', 'Topic B']);

    // discovered from curated notes only
    expect(plan.knownTypes.sort()).toEqual(['concept', 'rule']); // '_inbox' note's type excluded
    expect(plan.knownFolders.sort()).toEqual(['01-Concepts', '03-Rules']); // '_inbox' and 'Markdown' excluded

    // existing includes ALL scanned notes (incl. the _inbox draft) for dup-awareness
    expect(plan.existing.some(n => n.path === '_inbox/old.md')).toBe(true);
    expect(plan.existing.some(n => n.path.startsWith('Markdown/'))).toBe(false);
  });
});
