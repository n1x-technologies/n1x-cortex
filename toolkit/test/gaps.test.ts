// toolkit/test/gaps.test.ts
import { describe, it, expect } from 'vitest';
import { computeGaps } from '../src/curate/gaps.js';
import { loadConfig } from '../src/config.js';
import { freshState } from '../src/hooks/state.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-gaps-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'cited.md'), '# Cited source');
  writeFileSync(join(dir, 'Markdown', 'orphan.md'), '# Orphan source');   // no note cites it
  mkdirSync(join(dir, '01-Notes'));
  writeFileSync(join(dir, '01-Notes', 'a.md'), '---\nstatus: "draft"\nsource: "[[cited]]"\n---\n# A');     // cites cited.md, is a draft
  writeFileSync(join(dir, '01-Notes', 'b.md'), '---\nstatus: "verified"\n---\n# B');                        // no citation
  mkdirSync(join(dir, '00-MOC'));
  writeFileSync(join(dir, '00-MOC', 'index.md'), '---\ntype: "moc"\n---\n# Index');                         // MOC: excluded from missing-citation
  return dir;
}

describe('computeGaps', () => {
  it('classifies coverage buckets', () => {
    const dir = vault();
    const r = computeGaps(dir, loadConfig(dir, []), freshState());
    expect(r.unatomizedSources).toEqual(['Markdown/orphan.md']);   // cited.md is cited, orphan.md is not
    expect(r.notesMissingCitation).toEqual(['01-Notes/b.md']);     // b has no source; MOC index excluded
    expect(r.stuckDrafts).toEqual(['01-Notes/a.md']);              // a is a draft
    expect(r.staleSources).toEqual([]);                            // fresh state → no snapshot → none
  });
});
