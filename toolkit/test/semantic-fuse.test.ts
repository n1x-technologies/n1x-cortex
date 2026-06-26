import { describe, it, expect } from 'vitest';
import { rrf, rrfOrder } from '../src/semantic/fuse.js';

describe('reciprocal rank fusion', () => {
  it('rewards items ranked highly in multiple lists', () => {
    const scores = rrf([['a', 'b', 'c'], ['b', 'a', 'd']], 60);
    // a: 1/61 + 1/62 ; b: 1/62 + 1/61 -> a and b tie above c and d
    expect(scores.get('a')! + scores.get('b')!).toBeGreaterThan(scores.get('c')! + scores.get('d')!);
  });
  it('rrfOrder returns ids best-first with stable id tie-break', () => {
    const order = rrfOrder([['x'], ['y']], 60); // x and y both at rank 0 -> equal score -> id order
    expect(order).toEqual(['x', 'y']);
  });
  it('a unique top-ranked item beats one appearing only lower', () => {
    const order = rrfOrder([['top', 'mid'], ['top', 'low']], 60);
    expect(order[0]).toBe('top');
  });
});
