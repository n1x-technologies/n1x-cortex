import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorksheet } from '../src/atomize/bootstrap/ingest.js';
import { loadConfig } from '../src/config.js';
import { DISTILL_METHODOLOGY, DISTILL_METHODOLOGY_CODE } from '../src/atomize/methodology.js';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-ingest-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, '03-Rules', 'b.md'), '---\ntype: rule\n---\n# Existing');
  writeFileSync(join(dir, 'src', 'foo.ts'), 'export function add(a:number,b:number){return a+b;}\n');
  writeFileSync(join(dir, 'README.md'), '# Title\n\n## Section\n\nBody.');
  return dir;
}

describe('buildWorksheet', () => {
  it('builds a code worksheet: whole file as a segment + code methodology + repo-relative source', () => {
    const dir = vault();
    const w = buildWorksheet(dir, 'src/foo.ts', 'code', loadConfig(dir, []));
    expect(w.source).toBe('src/foo.ts');
    expect(w.instructions).toBe(DISTILL_METHODOLOGY_CODE);
    expect(w.segments.length).toBeGreaterThanOrEqual(1);
    expect(w.segments.map(s => s.body).join('\n')).toContain('export function add');
    expect(w.knownFolders).toContain('03-Rules'); // vault context present
  });
  it('builds a doc worksheet: heading segments + prose methodology', () => {
    const dir = vault();
    const w = buildWorksheet(dir, 'README.md', 'doc', loadConfig(dir, []));
    expect(w.source).toBe('README.md');
    expect(w.instructions).toBe(DISTILL_METHODOLOGY);
    expect(w.segments.map(s => s.heading)).toContain('Section');
  });
});
