import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../lib/dataset.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const VAULT = resolve(here, '../fixtures/ci-vault');
const QUESTIONS = resolve(here, '../fixtures/ci-questions.jsonl');

describe('ci fixture', () => {
  it('loads and validates every question against the vault', () => {
    const qs = loadDataset(QUESTIONS, VAULT);
    expect(qs.length).toBe(19);
  });

  it('ships a committed embedding store so CI runs offline', () => {
    const p = join(VAULT, '.cortex/embeddings/index.json');
    expect(existsSync(p)).toBe(true);
    const store = JSON.parse(readFileSync(p, 'utf8'));
    expect(store.records.length).toBe(12);
    expect(store.dim).toBeGreaterThan(0);
  });

  it('ships a query-vector cache covering every question', () => {
    const cache = JSON.parse(readFileSync(resolve(here, '../fixtures/query-vectors.json'), 'utf8'));
    for (const q of loadDataset(QUESTIONS, VAULT)) {
      expect(cache.vectors[q.question], `missing vector for "${q.question}"`).toBeDefined();
    }
  });
  // Fails if someone later appends a question without deciding whether it is a
  // trap — the count and the trap count would disagree.
  it('carries exactly four trap questions, each naming existing near-miss notes', () => {
    const qs = loadDataset(QUESTIONS, VAULT);
    const traps = qs.filter(q => !q.answerable);
    expect(traps).toHaveLength(4);
    for (const t of traps) {
      expect(t.nearMissPaths.length).toBeGreaterThan(0);
      expect(t.goldAnswer).toBeNull();
      expect(t.goldPaths).toEqual([]);
    }
  });
});
