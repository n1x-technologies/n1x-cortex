import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/search/tokenize.js';

describe('tokenize', () => {
  it('lowercases, splits on punctuation, drops 1-char tokens and stopwords', () => {
    expect(tokenize('The límite de Operación-X is 5!')).toEqual(['límite', 'operación', '5']);
  });
  it('keeps unicode letters and numbers', () => {
    expect(tokenize('Año 2026 régimen')).toEqual(['año', '2026', 'régimen']);
  });
  it('returns empty for only stopwords/punctuation', () => {
    expect(tokenize('the of a , . !')).toEqual([]);
  });
});
