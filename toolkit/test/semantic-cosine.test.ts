import { describe, it, expect } from 'vitest';
import { cosineDense } from '../src/semantic/cosine.js';

describe('cosineDense', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineDense([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineDense([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('returns 0 when a vector is all zeros', () => {
    expect(cosineDense([0, 0], [1, 1])).toBe(0);
  });
});
