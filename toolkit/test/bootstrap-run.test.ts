import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrap } from '../src/commands/bootstrap.js';
import { undoLatestRun } from '../src/atomize/backup.js';
import type { LlmClient } from '../src/atomize/llm-client.js';

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-boot-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'src', 'b.ts'), 'export const b = 2;\n');
  return dir;
}

// A client that returns a valid note for a.ts and garbage for b.ts (to prove continue-on-error).
function pickyClient(): LlmClient {
  return {
    complete: async (_system: string, user: string) => {
      if (user.includes('a.ts')) return JSON.stringify({ source: 'x', notes: [{ title: 'Concept A', type: 'concept', folder: '01-Concepts', body: 'About a.' }] });
      return 'sorry, no json here';
    },
  };
}

describe('runBootstrap', () => {
  it('dry-runs by default — never calls the model, writes nothing', async () => {
    const dir = repo();
    const throwingClient: LlmClient = { complete: async () => { throw new Error('must not be called in dry-run'); } };
    const res = await runBootstrap(dir, throwingClient);
    expect(res.dryRun).toBe(true);
    expect(res.notes).toBe(0);
    expect(res.perFile.length).toBe(2); // manifest of files it WOULD distill
    expect(existsSync(join(dir, '_inbox'))).toBe(false);
  });

  it('streams onProgress once per processed file on --write', async () => {
    const dir = repo();
    const lines: string[] = [];
    const res = await runBootstrap(dir, pickyClient(), { write: true, onProgress: (l) => lines.push(l) });
    expect(lines.length).toBe(res.files);
  });

  it('continue-on-error: one bad file fails but the run completes and drafts the good ones', async () => {
    const dir = repo();
    const res = await runBootstrap(dir, pickyClient(), { write: true });
    expect(res.files).toBe(2);
    expect(res.notes).toBeGreaterThan(0);
    expect(res.failures.map(f => f.path)).toContain('src/b.ts'); // garbage → failure
    expect(res.failures.map(f => f.path)).not.toContain('src/a.ts');
  });

  it('one shared runId: cortex undo reverses ALL bootstrap drafts in one call', async () => {
    const dir = repo();
    // client that succeeds for BOTH files
    const good: LlmClient = { complete: async (_s, u) => JSON.stringify({ source: 'x', notes: [{ title: `N ${u.includes('a.ts') ? 'A' : 'B'}`, type: 'concept', folder: '01-Concepts', body: 'x' }] }) };
    const res = await runBootstrap(dir, good, { write: true });
    expect(res.notes).toBe(2);
    const { reverted } = undoLatestRun(dir);
    expect(reverted.length).toBe(2); // both drafts deleted by a single undo
  });
});
