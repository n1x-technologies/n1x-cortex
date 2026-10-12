// That the citation counts words of the question, not times.
//
// Counting times is the same disease the lexical ranking had: rewarding
// repetition. In a short note it does not show; in a long document it decides
// which of thousands of lines is displayed, and the line that repeats one word
// beats the line that carries the answer.

import { describe, it, expect } from 'vitest';
import { bestLine, excerpt } from '../src/query/excerpt.js';

// The first line repeats one term of the question five times and covers one of
// the five. The second covers four, once each, and is the one with the figure.
// By occurrences the first wins 5 to 4; by distinct terms the second wins 4 to
// 1. The fixture is built so the two ways of counting disagree — otherwise it
// would measure nothing.
const body = [
  'The sector, the sector, the sector, the sector and the sector.',
  'The balance of the sector after the cut stood at eight hundred twenty units.',
].join('\n');

describe('bestLine counts distinct terms', () => {
  it('the line covering more words of the question beats the one repeating one', () => {
    const r = bestLine(body, 'how much is the balance of the sector after the cut');
    expect(r).toContain('eight hundred twenty');
  });

  it('when nothing matches it returns null, and excerpt falls back to the first line', () => {
    expect(bestLine(body, 'bank liquidity')).toBeNull();
    expect(excerpt(body, 'bank liquidity')).toContain('The sector, the sector');
  });

  it('ties keep document order', () => {
    const two = ['Talks about the sector.', 'Also talks about the sector.'].join('\n');
    expect(bestLine(two, 'sector')).toBe('Talks about the sector.');
  });

  it('an empty body does not blow up', () => {
    expect(bestLine('', 'whatever')).toBeNull();
    expect(excerpt('', 'whatever')).toBe('');
  });

  it('heading and frontmatter lines are not cited', () => {
    const noisy = ['# Title with sector', '---', '> quote with sector', 'The sector is here.'].join('\n');
    expect(bestLine(noisy, 'sector')).toBe('The sector is here.');
  });
});
