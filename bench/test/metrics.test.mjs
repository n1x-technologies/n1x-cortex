import { describe, it, expect } from 'vitest';
import { recallAtK, hitAtK, reciprocalRank, ndcgAtK, percentile, mean } from '../lib/metrics.mjs';

// This module's header says it is separately tested because a silent bug here
// corrupts every published number without failing anything. hitAtK shipped
// with no unit test at all — its coverage was indirect, through stage-a, and
// pinned only the exclusion side. `slice(0, k)` -> `slice(0, k - 1)` passed
// the whole suite and the gate.
describe('hitAtK', () => {
  it('is 1 when any target is in the top k, whatever the coverage', () => {
    expect(hitAtK(['a', 'b', 'c'], ['b'], 5)).toBe(1);
    expect(hitAtK(['a', 'b', 'c'], ['b', 'z'], 5)).toBe(1);      // 1 of 2 == 1
    expect(hitAtK(['a', 'b', 'c'], ['b', 'c'], 5)).toBe(1);      // 2 of 2 == 1
  });

  it('is 0 when no target is in the top k', () => {
    expect(hitAtK(['a', 'b'], ['z'], 5)).toBe(0);
  });

  it('includes rank exactly k and excludes rank k+1', () => {
    // The boundary the indirect coverage never pinned.
    expect(hitAtK(['1', '2', '3', '4', 'x'], ['x'], 5)).toBe(1);
    expect(hitAtK(['1', '2', '3', '4', '5', 'x'], ['x'], 5)).toBe(0);
  });

  it('treats an empty target set as 0, like recallAtK', () => {
    expect(hitAtK(['a'], [], 5)).toBe(0);
  });

  it('consumes the k window the same way duplicates do in recallAtK', () => {
    // Duplicates occupy ranks; they do not extend the window.
    expect(hitAtK(['a', 'a', 'a', 'a', 'a', 'x'], ['x'], 5)).toBe(0);
  });
});

describe('recallAtK', () => {
  it('is 1 when the only gold doc is in the top k', () => {
    expect(recallAtK(['a', 'b', 'c'], ['b'], 5)).toBe(1);
  });
  it('is 0 when the gold doc is absent', () => {
    expect(recallAtK(['a', 'b'], ['z'], 5)).toBe(0);
  });
  it('ignores hits beyond k', () => {
    expect(recallAtK(['a', 'b', 'c'], ['c'], 2)).toBe(0);
  });
  it('is the fraction found for multiple gold docs', () => {
    expect(recallAtK(['a', 'b'], ['a', 'z'], 5)).toBe(0.5);
  });
  it('is 0 for empty results', () => {
    expect(recallAtK([], ['a'], 5)).toBe(0);
  });
  it('handles k larger than the result set', () => {
    expect(recallAtK(['a'], ['a'], 100)).toBe(1);
  });
});

describe('reciprocalRank', () => {
  it('is 1 when the first hit is gold', () => {
    expect(reciprocalRank(['a', 'b'], ['a'], 10)).toBe(1);
  });
  it('is 1/3 when the third hit is the first gold hit', () => {
    expect(reciprocalRank(['x', 'y', 'a'], ['a'], 10)).toBeCloseTo(1 / 3, 10);
  });
  it('uses the earliest gold hit when several are gold', () => {
    expect(reciprocalRank(['x', 'a', 'b'], ['a', 'b'], 10)).toBe(0.5);
  });
  it('is 0 when no gold hit is within k', () => {
    expect(reciprocalRank(['x', 'y', 'a'], ['a'], 2)).toBe(0);
  });
});

describe('ndcgAtK', () => {
  it('is 1 when gold docs occupy the top positions', () => {
    expect(ndcgAtK(['a', 'b', 'x'], ['a', 'b'], 3)).toBeCloseTo(1, 10);
  });
  it('is 0 with no gold hits', () => {
    expect(ndcgAtK(['x', 'y'], ['a'], 3)).toBe(0);
  });
  it('matches the hand-computed value for a single gold doc at rank 2', () => {
    // DCG  = 1/log2(2+1) = 1/1.584962500721156 = 0.6309297535714575
    // IDCG = 1/log2(1+1) = 1
    expect(ndcgAtK(['x', 'a'], ['a'], 3)).toBeCloseTo(0.6309297535714575, 10);
  });
  it('ranks an earlier gold hit above a later one', () => {
    expect(ndcgAtK(['a', 'x', 'y'], ['a'], 3)).toBeGreaterThan(ndcgAtK(['x', 'y', 'a'], ['a'], 3));
  });
  it('is 0 for empty results', () => {
    expect(ndcgAtK([], ['a'], 5)).toBe(0);
  });
});

describe('percentile', () => {
  it('returns the median for p=0.5 on an odd-length set', () => {
    expect(percentile([3, 1, 2], 0.5)).toBe(2);
  });
  it('interpolates between neighbours on an even-length set', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
  });
  it('returns the max for p=1', () => {
    expect(percentile([5, 1, 9], 1)).toBe(9);
  });
  it('returns 0 for an empty set', () => {
    expect(percentile([], 0.5)).toBe(0);
  });
  it('does not mutate its input', () => {
    const xs = [3, 1, 2];
    percentile(xs, 0.5);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe('mean', () => {
  it('averages', () => expect(mean([1, 2, 3])).toBe(2));
  it('returns 0 for an empty set', () => expect(mean([])).toBe(0));
});
