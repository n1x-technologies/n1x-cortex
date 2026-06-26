// toolkit/test/dupes.test.ts
import { describe, it, expect } from 'vitest';
import { computeDupes } from '../src/curate/dupes.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-dupes-'));
  mkdirSync(join(dir, 'N'));
  const text = '# Refund policy\n\nCustomers may request a refund within thirty days of purchase for any reason.';
  writeFileSync(join(dir, 'N', 'refund1.md'), text);
  writeFileSync(join(dir, 'N', 'refund2.md'), text + ' Refunds are processed within five business days.');
  writeFileSync(join(dir, 'N', 'unrelated.md'), '# Office hours\n\nThe office opens at nine in the morning on weekdays.');
  return dir;
}

describe('computeDupes', () => {
  it('pairs near-identical notes above threshold and excludes unrelated', () => {
    const pairs = computeDupes(vault(), loadConfig(vault(), []), 0.45);
    expect(pairs.length).toBe(1);
    expect([pairs[0].a, pairs[0].b].map(p => p.split('/').pop()).sort()).toEqual(['refund1.md', 'refund2.md']);
    expect(pairs[0].score).toBeGreaterThanOrEqual(0.45);
  });
  it('returns nothing when threshold is 1', () => {
    expect(computeDupes(vault(), loadConfig(vault(), []), 1).length).toBe(0);
  });
});
