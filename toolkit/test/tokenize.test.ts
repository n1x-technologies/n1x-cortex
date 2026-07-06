import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/search/tokenize.js';

describe('tokenize', () => {
  it('lowercases, splits on punctuation, drops 1-char tokens and stopwords', () => {
    expect(tokenize('The límite de Operación-X is 5!')).toEqual(['limite', 'operacion', '5']);
  });
  it('keeps unicode letters and numbers', () => {
    expect(tokenize('Año 2026 régimen')).toEqual(['año', '2026', 'regimen']);
  });
  it('returns empty for only stopwords/punctuation', () => {
    expect(tokenize('the of a , . !')).toEqual([]);
  });
  it('folds acute accents and diaeresis so accented/unaccented spellings match', () => {
    expect(tokenize('reunión')).toEqual(tokenize('reunion'));
    expect(tokenize('compañía')).toEqual(tokenize('compañia'));
  });
  it('does not fold the tilde on ñ into a plain n (año and ano stay distinct)', () => {
    expect(tokenize('año')).not.toEqual(tokenize('ano'));
  });
});
