// toolkit/test/hook-cli.test.ts
import { describe, it, expect } from 'vitest';
import { runPause, runResume } from '../src/commands/pause.js';
import { loadState } from '../src/hooks/state.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('pause/resume', () => {
  it('flips the paused flag in state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-pause-'));
    runPause(dir);
    expect(loadState(dir).paused).toBe(true);
    runResume(dir);
    expect(loadState(dir).paused).toBe(false);
  });
});
