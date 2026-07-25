import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as closedBook from '../lib/systems/closed-book.mjs';
import * as fullContext from '../lib/systems/full-context.mjs';
import { loadCorpusText } from '../lib/systems/full-context.mjs';
import { countTokens } from '../lib/tokenizer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(here, '../fixtures/ci-vault');

describe('closed-book', () => {
  it('returns an empty payload and no citations', async () => {
    const r = await closedBook.run('Q', { vaultDir: VAULT });
    expect(r.promptPayload).toBe('');
    expect(r.citedPaths).toEqual([]);
    expect(r.retrievalTokens).toBe(0);
  });
});

describe('loadCorpusText', () => {
  it('concatenates every markdown note in the vault', () => {
    const text = loadCorpusText(VAULT);
    expect(text).toMatch(/196/);          // first-crack.md
    expect(text).toMatch(/chaff/i);        // equipment-maintenance.md
  });

  it('excludes dotfile directories such as .cortex', () => {
    expect(loadCorpusText(VAULT)).not.toMatch(/"records"/);
  });

  it('labels each note with its vault-relative path', () => {
    expect(loadCorpusText(VAULT)).toMatch(/notes\/first-crack\.md/);
  });
});

describe('full-context', () => {
  it('cites every note in the corpus', async () => {
    const r = await fullContext.run('Q', { vaultDir: VAULT, corpusText: loadCorpusText(VAULT) });
    expect(r.citedPaths.length).toBeGreaterThanOrEqual(12);
    expect(r.citedPaths).toContain('notes/first-crack.md');
  });

  it('costs far more than any retriever', async () => {
    const r = await fullContext.run('Q', { vaultDir: VAULT, corpusText: loadCorpusText(VAULT) });
    expect(countTokens(r.promptPayload)).toBeGreaterThan(500);
  });

  it('builds the corpus itself when ctx.corpusText is absent', async () => {
    const r = await fullContext.run('Q', { vaultDir: VAULT });
    expect(r.promptPayload.length).toBeGreaterThan(0);
  });
});
