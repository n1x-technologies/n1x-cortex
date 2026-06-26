// toolkit/test/backup.test.ts
import { describe, it, expect } from 'vitest';
import { backupNote, restoreLatestBackup, recordPromotions, undoLatestRun } from '../src/atomize/backup.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-bak-'));
  mkdirSync(join(dir, '01-Concepts'));
  writeFileSync(join(dir, '01-Concepts', 'n.md'), 'original content');
  return dir;
}

describe('backupNote / restoreLatestBackup', () => {
  it('backs up a note under .cortex/backups/<runId>/ and restores it', () => {
    const dir = vault();
    const rel = '01-Concepts/n.md';
    const bak = backupNote(dir, rel, '2026-01-01T00-00-00');
    expect(bak).toBe('.cortex/backups/2026-01-01T00-00-00/01-Concepts/n.md');
    expect(readFileSync(join(dir, bak), 'utf8')).toBe('original content');

    // mutate, then restore
    writeFileSync(join(dir, rel), 'EDITED');
    const { restored } = restoreLatestBackup(dir);
    expect(restored).toEqual(['01-Concepts/n.md']);
    expect(readFileSync(join(dir, rel), 'utf8')).toBe('original content');
  });

  it('recreates missing parent directory during restore', () => {
    const dir = vault();
    const rel = '01-Concepts/n.md';
    backupNote(dir, rel, '2026-01-01T00-00-00');
    // delete the parent directory entirely — simulates a folder removed between backup and restore
    rmSync(join(dir, '01-Concepts'), { recursive: true, force: true });
    expect(existsSync(join(dir, '01-Concepts'))).toBe(false);
    // restore must recreate the directory and write the file without throwing
    const { restored } = restoreLatestBackup(dir);
    expect(restored).toEqual(['01-Concepts/n.md']);
    expect(existsSync(join(dir, rel))).toBe(true);
    expect(readFileSync(join(dir, rel), 'utf8')).toBe('original content');
  });

  it('restores the newest backup set and returns [] when none exist', () => {
    const dir = vault();
    expect(restoreLatestBackup(dir)).toEqual({ restored: [] });
    backupNote(dir, '01-Concepts/n.md', '2026-01-01T00-00-00');
    writeFileSync(join(dir, '01-Concepts', 'n.md'), 'v2');
    backupNote(dir, '01-Concepts/n.md', '2026-02-02T00-00-00'); // newer runId backs up 'v2'
    writeFileSync(join(dir, '01-Concepts', 'n.md'), 'v3');
    restoreLatestBackup(dir);
    expect(readFileSync(join(dir, '01-Concepts', 'n.md'), 'utf8')).toBe('v2'); // newest set wins
  });
});

describe('undoLatestRun', () => {
  it('reverses the latest run whether it was an edit-backup or a promotion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-undo-'));
    mkdirSync(join(dir, '01-Concepts'));
    mkdirSync(join(dir, '_inbox', '01-Concepts'), { recursive: true });

    // an earlier edit-backup run
    writeFileSync(join(dir, '01-Concepts', 'edited.md'), 'EDITED');
    backupNote(dir, '01-Concepts/edited.md', '2026-01-01T00-00-00'); // backs up 'EDITED'
    writeFileSync(join(dir, '01-Concepts', 'edited.md'), 'CHANGED-AGAIN');

    // a LATER promotion run: a note was moved _inbox → curated
    writeFileSync(join(dir, '01-Concepts', 'moved.md'), 'note body');       // already at the destination
    recordPromotions(dir, [{ from: '_inbox/01-Concepts/moved.md', to: '01-Concepts/moved.md' }], '2026-02-02T00-00-00');

    const r = undoLatestRun(dir); // latest run is the promotion
    expect(r.reverted).toEqual(['_inbox/01-Concepts/moved.md']);
    expect(existsSync(join(dir, '_inbox', '01-Concepts', 'moved.md'))).toBe(true);  // moved back
    expect(existsSync(join(dir, '01-Concepts', 'moved.md'))).toBe(false);           // removed from curated
    expect(readFileSync(join(dir, '_inbox', '01-Concepts', 'moved.md'), 'utf8')).toBe('note body');
    expect(r.restored).toEqual([]);

    // now the latest remaining run is the edit-backup
    const r2 = undoLatestRun(dir);
    expect(r2.restored).toEqual(['01-Concepts/edited.md']);
    expect(readFileSync(join(dir, '01-Concepts', 'edited.md'), 'utf8')).toBe('EDITED');
  });

  it('returns both empty when there is nothing to undo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-undo0-'));
    expect(undoLatestRun(dir)).toEqual({ restored: [], reverted: [] });
  });

  it('walks back across two backup runs (symmetric consumption)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-walkback-'));
    mkdirSync(join(dir, '01-Concepts'));
    const rel = '01-Concepts/note.md';

    // run A: backs up 'original'
    writeFileSync(join(dir, rel), 'original');
    backupNote(dir, rel, '2026-01-01T00-00-00');
    // mutate to 'after-A'
    writeFileSync(join(dir, rel), 'after-A');

    // run B: backs up 'after-A'
    backupNote(dir, rel, '2026-02-02T00-00-00');
    // mutate to 'after-B'
    writeFileSync(join(dir, rel), 'after-B');

    // first undo: consumes B, restores 'after-A'
    const r1 = undoLatestRun(dir);
    expect(r1.restored).toEqual(['01-Concepts/note.md']);
    expect(r1.reverted).toEqual([]);
    expect(readFileSync(join(dir, rel), 'utf8')).toBe('after-A');

    // second undo: consumes A, restores 'original'
    const r2 = undoLatestRun(dir);
    expect(r2.restored).toEqual(['01-Concepts/note.md']);
    expect(r2.reverted).toEqual([]);
    expect(readFileSync(join(dir, rel), 'utf8')).toBe('original');

    // third undo: nothing left
    const r3 = undoLatestRun(dir);
    expect(r3).toEqual({ restored: [], reverted: [] });
  });
});
