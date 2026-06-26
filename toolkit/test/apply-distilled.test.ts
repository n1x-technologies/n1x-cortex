// toolkit/test/apply-distilled.test.ts
import { describe, it, expect } from 'vitest';
import { applyDistilled } from '../src/atomize/apply-distilled.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DistilledInput } from '../src/types.js';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-apply-'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '03-Rules'));
  // an existing curated note that one distilled note will duplicate (by title)
  writeFileSync(join(dir, '03-Rules', 'existing.md'), '---\ntype: rule\nid: existing\n---\n# Settlement window');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# ignored');
  return dir;
}

function specsFile(dir: string, input: DistilledInput): string {
  const p = join(dir, 'distilled.json');
  writeFileSync(p, JSON.stringify(input));
  return p;
}

const input: DistilledInput = {
  source: 'src',
  notes: [
    { title: 'Operation limit', type: 'rule', folder: '03-Rules', tags: ['rule', 'limit'], body: 'The limit is 5. See [[Settlement window]].' },
    { title: 'Operation limit', type: 'rule', folder: '03-Rules', body: 'A second note that slugs the same — must de-collide.' },
    { title: 'Settlement window', type: 'rule', folder: '03-Rules', body: 'Duplicate of an existing note — must skip.' },
  ],
};

describe('applyDistilled', () => {
  it('dry-runs by default and writes nothing', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const r = applyDistilled(dir, specsFile(dir, input), cfg, { dryRun: true });
    expect(r.written).toEqual([]);
    expect(r.plan.dryRun).toBe(true);
    expect(existsSync(join(dir, '_inbox'))).toBe(false);
  });

  it('writes distilled drafts under _inbox/<folder>/, de-collides, skips duplicates, renders tags + citation', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const r = applyDistilled(dir, specsFile(dir, input), cfg, { dryRun: false });

    // 2 creates (the third is a duplicate → skip)
    expect(r.written.length).toBe(2);
    expect(r.written.every(p => p.startsWith('_inbox/03-Rules/'))).toBe(true);
    expect(r.written).toContain('_inbox/03-Rules/operation-limit.md');
    expect(r.written).toContain('_inbox/03-Rules/operation-limit-2.md'); // de-collided
    expect(r.plan.items.some(i => i.action === 'skip')).toBe(true);      // 'Settlement window' duplicate

    // rendered content: tags + citation present, source file untouched
    const md = readFileSync(join(dir, '_inbox/03-Rules/operation-limit.md'), 'utf8');
    expect(md).toMatch(/tags: \[rule, limit\]/);
    expect(md).toMatch(/\*Source: \[\[src\]\]\*/);
    expect(readFileSync(join(dir, 'Markdown', 'src.md'), 'utf8')).toBe('# ignored');
  });

  it('routes a note with no folder to _inbox/ root', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const noFolder: DistilledInput = { source: 'src', notes: [{ title: 'Loose note', body: 'No folder.' }] };
    const r = applyDistilled(dir, specsFile(dir, noFolder), cfg, { dryRun: false });
    expect(r.written).toEqual(['_inbox/loose-note.md']);
  });

  it('routes empty or whitespace title to _inbox/note.md and de-collides two such notes', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const noTitle: DistilledInput = {
      source: 'src',
      notes: [
        { title: '', body: 'First empty title.' },
        { title: '   ', body: 'Second empty title.' },
      ],
    };
    const r = applyDistilled(dir, specsFile(dir, noTitle), cfg, { dryRun: false });
    expect(r.written.length).toBe(2);
    expect(r.written).toContain('_inbox/note.md');
    expect(r.written).toContain('_inbox/note-2.md');
    expect(existsSync(join(dir, '_inbox/note.md'))).toBe(true);
    expect(existsSync(join(dir, '_inbox/note-2.md'))).toBe(true);
  });

  it('two notes with the same title but different folders both create without collision', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const crossFolder: DistilledInput = {
      source: 'src',
      notes: [
        { title: 'Shared title', folder: 'FolderA', body: 'In folder A.' },
        { title: 'Shared title', folder: 'FolderB', body: 'In folder B.' },
      ],
    };
    const r = applyDistilled(dir, specsFile(dir, crossFolder), cfg, { dryRun: false });
    expect(r.written.length).toBe(2);
    expect(r.written).toContain('_inbox/FolderA/shared-title.md');
    expect(r.written).toContain('_inbox/FolderB/shared-title.md');
    expect(existsSync(join(dir, '_inbox/FolderA/shared-title.md'))).toBe(true);
    expect(existsSync(join(dir, '_inbox/FolderB/shared-title.md'))).toBe(true);
  });

  it('sanitizes a traversal folder — note lands under _inbox/ and nothing is created outside the vault', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const traversal: DistilledInput = {
      source: 'src',
      notes: [
        { title: 'Evil note', body: 'Content.', folder: '../../evil' },
      ],
    };
    const r = applyDistilled(dir, specsFile(dir, traversal), cfg, { dryRun: false });
    // All written paths must be under _inbox/
    r.written.forEach(p => {
      expect(p.startsWith('_inbox/')).toBe(true);
    });
    // No file created at a traversed location relative to vault parent
    expect(existsSync(join(dir, '..', 'evil', 'evil-note.md'))).toBe(false);
    expect(existsSync(join(dir, '../../evil'))).toBe(false);
  });
});
