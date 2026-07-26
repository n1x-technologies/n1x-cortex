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

  // The property that makes a trap a trap — that the corpus does not answer it
  // — was asserted nowhere. Everything above is structural and would still pass
  // if a future note quietly supplied one of these answers, at which point the
  // question becomes answerable and Stage B scores a CORRECT answer as an
  // invention. That is the one dataset property with no automated defence.
  //
  // A full check needs semantics, so this is a tripwire, not a classifier: one
  // pattern per trap for the fact that would make it answerable. If a fixture
  // edit trips it, the question to ask is whether the trap is still a trap —
  // not how to make the regex pass.
  it('keeps every trap unanswerable — the corpus must not supply these facts', () => {
    const corpus = ['batch-logging', 'cupping-protocol', 'defect-sorting', 'drum-temperature',
      'equipment-maintenance', 'extraction-yield', 'first-crack', 'green-storage', 'grind-size',
      'packaging', 'roast-profile', 'water-chemistry']
      .map(n => readFileSync(join(VAULT, `notes/${n}.md`), 'utf8')).join('\n');

    // t1 — drum rotation speed. No RPM figure anywhere.
    expect(corpus).not.toMatch(/\brpm\b|rotation speed|rotates? at/i);
    // t2 — a grind size stated for cupping. grind-size.md names espresso and
    // filter only; cupping-protocol.md states dose and water, never a grind.
    expect(corpus).not.toMatch(/cupping[^.]*(micron|grind size)|(micron|grind size)[^.]*cupping/i);
    // t3 — shelf life of ROASTED coffee. green-storage.md's 12 months is
    // scoped to green coffee, which is what makes it a near miss.
    expect(corpus).not.toMatch(/roasted coffee[^.]*(shelf life|stays fresh|best before)/i);
    // t4 — the origin of the green lots. The corpus never names one, which is
    // why nothing in it is answer-shaped for this question.
    expect(corpus).not.toMatch(/\b(ethiopia|colombia|brazil|kenya|guatemala|sumatra|yirgacheffe|huila)\w*/i);
    expect(corpus).not.toMatch(/\borigin\b|\bvarietal\b|\bsingle[- ]origin\b/i);
  });
});
