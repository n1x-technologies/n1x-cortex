// toolkit/test/dupes-same-type.test.ts
import { describe, it, expect } from 'vitest';
import { computeDupes } from '../src/curate/dupes.js';
import { loadConfig } from '../src/config.js';
import { collectFrontmatterKeys } from '../src/vault.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BODY = '# Refund policy\n\nCustomers may request a refund within thirty days of purchase for any reason.';

function note(type: string): string {
  return `---\ntype: ${type}\n---\n${BODY}`;
}

/** Two near-identical notes of the given types, plus an unrelated one. */
function vault(typeA: string, typeB: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-dupes-type-'));
  mkdirSync(join(dir, 'N'));
  writeFileSync(join(dir, 'N', 'a.md'), note(typeA));
  writeFileSync(join(dir, 'N', 'b.md'), note(typeB));
  writeFileSync(join(dir, 'N', 'c.md'), '---\ntype: CON\n---\n# Office hours\n\nThe office opens at nine in the morning on weekdays.');
  return dir;
}

function dupes(dir: string, crossType: boolean) {
  return computeDupes(dir, loadConfig(dir, collectFrontmatterKeys(dir)), 0.45, { crossType });
}

describe('computeDupes — same-type filtering', () => {
  it('pairs near-identical notes of the SAME type by default', () => {
    const dir = vault('CON', 'CON');
    expect(dupes(dir, false).length).toBe(1);
  });

  it('excludes cross-type pairs by default', () => {
    const dir = vault('CON', 'MVP');
    expect(dupes(dir, false).length).toBe(0);
  });

  it('includes cross-type pairs when crossType is set', () => {
    const dir = vault('CON', 'MVP');
    expect(dupes(dir, true).length).toBe(1);
  });

  it('is a no-op for vaults without a type taxonomy (all share the empty bucket)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-dupes-notype-'));
    mkdirSync(join(dir, 'N'));
    writeFileSync(join(dir, 'N', 'a.md'), BODY);
    writeFileSync(join(dir, 'N', 'b.md'), BODY);
    expect(computeDupes(dir, loadConfig(dir, collectFrontmatterKeys(dir)), 0.45).length).toBe(1);
  });
});
