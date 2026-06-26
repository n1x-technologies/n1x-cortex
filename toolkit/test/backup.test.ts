// toolkit/test/backup.test.ts
import { describe, it, expect } from 'vitest';
import { backupNote, restoreLatestBackup } from '../src/atomize/backup.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
