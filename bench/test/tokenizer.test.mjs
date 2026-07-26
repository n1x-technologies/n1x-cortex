import { describe, it, expect } from 'vitest';
import { countTokens } from '../lib/tokenizer.mjs';

describe('countTokens', () => {
  it('returns 0 for the empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('counts a known short string as a small positive integer', () => {
    const n = countTokens('hello world');
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(5);
  });

  it('is not the chars/4 approximation', () => {
    // Dense markdown punctuation tokenizes far above chars/4. This test exists
    // so a future refactor cannot silently reinstate the approximation.
    const text = '## `cortex query --json` — hits[0].path\n\n- [[wikilink]]\n';
    expect(countTokens(text)).toBeGreaterThan(Math.round(text.length / 4));
  });

  it('is monotonic: appending text never lowers the count', () => {
    const a = countTokens('the quick brown fox');
    const b = countTokens('the quick brown fox jumps over the lazy dog');
    expect(b).toBeGreaterThan(a);
  });
});
