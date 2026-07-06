import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redirectInner, redirectLinks, runMergeNotes } from '../src/curate/merge.js';
import { undoLatestRun } from '../src/atomize/backup.js';
import { loadConfig } from '../src/config.js';

describe('redirectInner', () => {
  it('preserves #section and |alias when repointing', () => {
    expect(redirectInner('old-note', 'keeper')).toBe('keeper');
    expect(redirectInner('old-note#part', 'keeper')).toBe('keeper#part');
    expect(redirectInner('old-note|Display', 'keeper')).toBe('keeper|Display');
    expect(redirectInner('old-note#part|Display', 'keeper')).toBe('keeper#part|Display');
    expect(redirectInner('old-note\\|Tbl', 'keeper')).toBe('keeper\\|Tbl');
  });
});

describe('redirectLinks', () => {
  it('only rewrites links that resolve to the dropped note', () => {
    const resolve = new Map([['old', 'old'], ['other', 'other']]);
    const raw = 'See [[old]] and [[other]] and [[old#x|Y]].';
    expect(redirectLinks(raw, 'old', 'keeper', resolve)).toBe('See [[keeper]] and [[other]] and [[keeper#x|Y]].');
  });
});

function vault(): { dir: string; config: ReturnType<typeof loadConfig> } {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-merge-'));
  mkdirSync(join(dir, '03-Rules'), { recursive: true });
  writeFileSync(join(dir, '03-Rules', 'refund.md'), '---\nid: "refund"\nstatus: "documented"\n---\n# Refund rule\nRefunds in 30 days.');
  writeFileSync(join(dir, '03-Rules', 'refunds-dup.md'), '---\nid: "refunds-dup"\nstatus: "draft"\n---\n# Refunds\nMoney back in a month.');
  mkdirSync(join(dir, '01-Concepts'), { recursive: true });
  writeFileSync(join(dir, '01-Concepts', 'policy.md'), '---\nid: "policy"\n---\n# Policy\nSee [[refunds-dup]] for details.');
  return { dir, config: loadConfig(dir, ['id', 'status']) };
}

describe('runMergeNotes', () => {
  it('dry-run reports the redirect targets and writes nothing', () => {
    const { dir, config } = vault();
    const r = runMergeNotes(dir, config, { keepPath: '03-Rules/refund.md', dropPath: '03-Rules/refunds-dup.md', content: '# merged' });
    expect(r.dryRun).toBe(true);
    expect(r.redirected).toEqual(['01-Concepts/policy.md']);
    expect(existsSync(join(dir, '03-Rules', 'refunds-dup.md'))).toBe(true);   // not deleted
  });

  it('merges, redirects inbound links, deletes the drop — and undo reverses all of it', () => {
    const { dir, config } = vault();
    const merged = '---\nid: "refund"\nstatus: "documented"\n---\n# Refund rule\nRefunds within 30 days (a month).';
    const r = runMergeNotes(dir, config, { keepPath: '03-Rules/refund.md', dropPath: '03-Rules/refunds-dup.md', content: merged }, { write: true });

    expect(r.dryRun).toBe(false);
    expect(readFileSync(join(dir, '03-Rules', 'refund.md'), 'utf8')).toContain('a month');
    expect(existsSync(join(dir, '03-Rules', 'refunds-dup.md'))).toBe(false);             // dropped
    expect(readFileSync(join(dir, '01-Concepts', 'policy.md'), 'utf8')).toContain('[[refund]]');   // redirected
    expect(r.backups.length).toBe(3);

    // undo restores keeper, recreates the dropped note, reverts the redirect
    undoLatestRun(dir);
    expect(readFileSync(join(dir, '03-Rules', 'refund.md'), 'utf8')).toContain('Refunds in 30 days.');
    expect(existsSync(join(dir, '03-Rules', 'refunds-dup.md'))).toBe(true);
    expect(readFileSync(join(dir, '01-Concepts', 'policy.md'), 'utf8')).toContain('[[refunds-dup]]');
  });

  it('skips a self-merge and a missing note', () => {
    const { dir, config } = vault();
    expect(runMergeNotes(dir, config, { keepPath: 'a.md', dropPath: 'a.md', content: '' }).skipped?.reason).toBe('same-note');
    expect(runMergeNotes(dir, config, { keepPath: '03-Rules/refund.md', dropPath: 'nope.md', content: '' }).skipped?.reason).toBe('drop-missing');
  });
});
