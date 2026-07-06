// toolkit/test/verify.test.ts
import { describe, it, expect } from 'vitest';
import { verifyNote } from '../src/curate/verify.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-verify-'));
  mkdirSync(join(dir, 'N'));
  // flow links to rule1 (exists, cited, verified) and rule2 (a gap)
  writeFileSync(join(dir, 'N', 'flow.md'), '---\nstatus: "draft"\n---\n# Flow\n\nSee [[rule1]] and [[rule2]].');
  writeFileSync(join(dir, 'N', 'rule1.md'), '---\nstatus: "verified"\nsource: "[[src]]"\n---\n# Rule1');
  return dir;
}

describe('verifyNote', () => {
  it('builds a completeness checklist over the link closure', () => {
    const dir = vault();
    const r = verifyNote(dir, loadConfig(dir, []), 'N/flow.md', 2);
    const byTarget = Object.fromEntries(r.items.map(i => [i.target, i]));
    expect(byTarget['rule1']).toEqual({ target: 'rule1', exists: true, cited: true, verified: true });
    expect(byTarget['rule2']).toEqual({ target: 'rule2', exists: false, cited: false, verified: false });
    expect(r.ok).toBe(false);   // rule2 is a gap
  });
});
