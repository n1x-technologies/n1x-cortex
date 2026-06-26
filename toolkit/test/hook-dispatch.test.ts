// toolkit/test/hook-dispatch.test.ts
import { describe, it, expect } from 'vitest';
import { runHook } from '../src/hooks/dispatch.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-disp-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'a.md'), '# A');
  return dir;
}

describe('runHook', () => {
  it('returns a JSON response for a known event', () => {
    const out = runHook(vault(), 'SessionStart', '{}');
    expect(JSON.parse(out).hookSpecificOutput.hookEventName).toBe('SessionStart');
  });
  it('fails open: malformed stdin → "{}"', () => {
    expect(runHook(vault(), 'SessionStart', 'not json')).toBe('{}');
  });
  it('unknown event → "{}"', () => {
    expect(runHook(vault(), 'Nope', '{}')).toBe('{}');
  });
});
