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

  it('tolerates a model returning tags as a comma string instead of an array (no crash)', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    // A real ollama bootstrap crashed a file with "spec.tags.join is not a function"
    // because the model emitted tags as a string. Normalize instead of crashing.
    const badTags: DistilledInput = {
      source: 'src',
      notes: [{ title: 'Stringy tags', body: 'x', tags: 'queue, retry' as unknown as string[] }],
    };
    const r = applyDistilled(dir, specsFile(dir, badTags), cfg, { dryRun: false });
    expect(r.written).toEqual(['_inbox/stringy-tags.md']);
    const md = readFileSync(join(dir, '_inbox/stringy-tags.md'), 'utf8');
    expect(md).toMatch(/tags: \[queue, retry\]/);
  });

  it('strips a leading _inbox/ the model put in the folder (no _inbox/_inbox/ nesting)', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    // A weaker/local model often echoes _inbox into the folder value. We always
    // prepend _inbox/ ourselves, so those must be stripped — else notes land at
    // _inbox/_inbox/_inbox/… (seen live during a real ollama bootstrap run).
    const echoed: DistilledInput = {
      source: 'src',
      notes: [
        { title: 'Alpha', folder: '_inbox/01-Concepts', body: 'a' },
        { title: 'Beta', folder: '_inbox/_inbox/01-Concepts', body: 'b' },
        { title: 'Gamma', folder: '_inbox', body: 'c' },
      ],
    };
    const r = applyDistilled(dir, specsFile(dir, echoed), cfg, { dryRun: false });
    expect(r.written).toContain('_inbox/01-Concepts/alpha.md');
    expect(r.written).toContain('_inbox/01-Concepts/beta.md');
    expect(r.written).toContain('_inbox/gamma.md'); // folder was only "_inbox" → root
    expect(r.written.every(p => !p.includes('_inbox/_inbox'))).toBe(true);
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

function updVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-upd-'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '01-Concepts'));
  writeFileSync(join(dir, '01-Concepts', 'limit.md'),
    '---\ntype: concept\nid: limit\n---\n# Operation limit\n\nThe limit is 5.\n\n*Source: [[old]]*\n');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# ignored');
  return dir;
}
function specs(dir: string, input: DistilledInput): string {
  const p = join(dir, 'd.json'); writeFileSync(p, JSON.stringify(input)); return p;
}
const upd: DistilledInput = { source: 'rules', notes: [
  { title: 'Operation limit', action: 'update', targetPath: '01-Concepts/limit.md',
    body: '# Operation limit\n\nThe limit is 5, raised to 8 in 2026.\n\n*Source: [[old]]*' },
]};

describe('applyDistilled — update action', () => {
  it('dry-runs by default: no write, no backup', () => {
    const dir = updVault();
    const r = applyDistilled(dir, specs(dir, upd), loadConfig(dir, []), { dryRun: true });
    expect(r.updated).toEqual([]);
    expect(r.backups).toEqual([]);
    expect(existsSync(join(dir, '.cortex'))).toBe(false);
    expect(readFileSync(join(dir, '01-Concepts', 'limit.md'), 'utf8')).toContain('The limit is 5.');
  });

  it('with --write: backs up then merges in place (frontmatter preserved)', () => {
    const dir = updVault();
    const r = applyDistilled(dir, specs(dir, upd), loadConfig(dir, []), { dryRun: false, runId: 'RUN1' });
    expect(r.updated).toEqual(['01-Concepts/limit.md']);
    expect(r.backups).toEqual(['.cortex/backups/RUN1/01-Concepts/limit.md']);
    const after = readFileSync(join(dir, '01-Concepts', 'limit.md'), 'utf8');
    expect(after).toMatch(/^---\ntype: concept\nid: limit\n---/); // frontmatter verbatim
    expect(after).toContain('raised to 8 in 2026');
    // backup holds the original
    expect(readFileSync(join(dir, '.cortex/backups/RUN1/01-Concepts/limit.md'), 'utf8')).toContain('The limit is 5.\n');
  });

  it('hard-blocks a Markdown/ target, a missing target, and a traversal target', () => {
    const dir = updVault();
    const bad: DistilledInput = { source: 'rules', notes: [
      { title: 'X', action: 'update', targetPath: 'Markdown/src.md', body: '# X\n\nlots of new text here to pass shrink' },
      { title: 'Y', action: 'update', targetPath: '01-Concepts/missing.md', body: '# Y\n\nnew' },
      { title: 'Z', action: 'update', targetPath: '../escape.md', body: '# Z\n\nnew' },
    ]};
    const r = applyDistilled(dir, specs(dir, bad), loadConfig(dir, []), { dryRun: false, runId: 'RUN2' });
    expect(r.updated).toEqual([]);
    expect(r.skipped.map(s => s.reason).sort()).toEqual(['not-found', 'outside-vault', 'source-immutable']);
    expect(readFileSync(join(dir, 'Markdown', 'src.md'), 'utf8')).toBe('# ignored'); // source untouched
    expect(existsSync(join(dir, '..', 'escape.md'))).toBe(false);
  });

  it('defaults to dryRun:true when no opts are passed', () => {
    const dir = updVault();
    const r = applyDistilled(dir, specs(dir, upd), loadConfig(dir, []));
    expect(r.updated).toEqual([]);
    expect(existsSync(join(dir, '.cortex'))).toBe(false);
  });

  it('absolute targetPath pointing into Markdown/ is blocked as source-immutable', () => {
    const dir = updVault();
    const absTarget = join(dir, 'Markdown', 'src.md');
    const absInput: DistilledInput = { source: 'rules', notes: [
      { title: 'X', action: 'update', targetPath: absTarget,
        body: '# X\n\nlots of new text here that is definitely long enough to pass the shrink guard check' },
    ]};
    const r = applyDistilled(dir, specs(dir, absInput), loadConfig(dir, []), { dryRun: false, runId: 'RUN-ABS' });
    expect(r.updated).toEqual([]);
    expect(r.skipped).toEqual([{ target: absTarget, reason: 'source-immutable' }]);
    expect(readFileSync(join(dir, 'Markdown', 'src.md'), 'utf8')).toBe('# ignored');
  });

  it('shrink guard skips a destructive update unless forced', () => {
    const dir = updVault();
    const tiny: DistilledInput = { source: 'rules', notes: [
      { title: 'Operation limit', action: 'update', targetPath: '01-Concepts/limit.md', body: '# x' },
    ]};
    const guarded = applyDistilled(dir, specs(dir, tiny), loadConfig(dir, []), { dryRun: false, runId: 'RUN3' });
    expect(guarded.updated).toEqual([]);
    expect(guarded.skipped).toEqual([{ target: '01-Concepts/limit.md', reason: 'shrink-guard' }]);
    const forced = applyDistilled(dir, specs(dir, tiny), loadConfig(dir, []), { dryRun: false, force: true, runId: 'RUN4' });
    expect(forced.updated).toEqual(['01-Concepts/limit.md']);
  });
});
