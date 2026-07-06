// toolkit/test/verify-all.test.ts
import { describe, it, expect } from 'vitest';
import { verifyAll } from '../src/curate/verify.js';
import { loadConfig } from '../src/config.js';
import { collectFrontmatterKeys } from '../src/vault.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-verify-all-'));
  mkdirSync(join(dir, 'N'));
  // a → links to b (exists) and to two missing targets → 2 gaps
  writeFileSync(join(dir, 'N', 'a.md'), '# A\n\nSee [[b]], [[missing-one]] and [[missing-two]].');
  // b → links only to a (exists) → 0 gaps, complete
  writeFileSync(join(dir, 'N', 'b.md'), '# B\n\nBack to [[a]].');
  // c → one missing target → 1 gap
  writeFileSync(join(dir, 'N', 'c.md'), '# C\n\nDangling [[nope]].');
  return dir;
}

function run(dir: string) {
  return verifyAll(dir, loadConfig(dir, collectFrontmatterKeys(dir)), 1);
}

describe('verifyAll', () => {
  it('returns only notes with gaps, worst first', () => {
    const r = run(vault());
    expect(r.total).toBe(3);
    expect(r.incomplete.map(n => n.path.split('/').pop())).toEqual(['a.md', 'c.md']);
    expect(r.incomplete[0].gaps).toBe(2);
    expect(r.incomplete[1].gaps).toBe(1);
  });

  it('reports an all-OK vault with no incomplete notes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-verify-ok-'));
    mkdirSync(join(dir, 'N'));
    writeFileSync(join(dir, 'N', 'x.md'), '# X\n\nLinks [[y]].');
    writeFileSync(join(dir, 'N', 'y.md'), '# Y\n\nLinks [[x]].');
    const r = run(dir);
    expect(r.total).toBe(2);
    expect(r.incomplete).toEqual([]);
  });
});
