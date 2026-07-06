// toolkit/test/atomize-undo-creations.test.ts
//
// Regression guard for the reversibility promise: `cortex undo` must reverse
// note CREATIONS made by the CLI atomize paths (--apply and --model), the same
// way it already reverses bootstrap/MCP creations and CLI updates. Before the
// fix, applyDistilled wrote drafts but never journaled them, so undo left them
// behind — contradicting the documented "every write is reversible".
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runApply, runUndo } from '../src/commands/atomize.js';
import type { DistilledInput } from '../src/types.js';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-undo-create-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# ignored');
  return dir;
}

function specsFile(dir: string, input: DistilledInput): string {
  const p = join(dir, 'distilled.json');
  writeFileSync(p, JSON.stringify(input));
  return p;
}

describe('cortex atomize --apply → undo reverses created drafts', () => {
  it('undo deletes the drafts the CLI apply path created', () => {
    const dir = vault();
    const input: DistilledInput = {
      source: 'src',
      notes: [
        { title: 'Widget rate limit', type: 'rule', folder: '03-Rules', body: 'The limit is 5.' },
        { title: 'Retry policy', type: 'rule', folder: '03-Rules', body: 'Back off exponentially.' },
      ],
    };
    const r = runApply(dir, specsFile(dir, input), { write: true });
    expect(r.written.length).toBe(2);
    for (const rel of r.written) expect(existsSync(join(dir, rel))).toBe(true);

    const { reverted } = runUndo(dir);
    for (const rel of r.written) {
      expect(reverted).toContain(rel);
      expect(existsSync(join(dir, rel))).toBe(false);
    }
  });

  it('a dry-run apply journals nothing (undo finds nothing to reverse)', () => {
    const dir = vault();
    const input: DistilledInput = { source: 'src', notes: [{ title: 'Loose', body: 'x' }] };
    runApply(dir, specsFile(dir, input), { write: false });
    const { restored, reverted } = runUndo(dir);
    expect(restored).toEqual([]);
    expect(reverted).toEqual([]);
  });
});
