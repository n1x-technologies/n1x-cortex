import { describe, it, expect } from 'vitest';
import { chunkCode } from '../src/atomize/bootstrap/chunk.js';

describe('chunkCode', () => {
  it('returns a single chunk when under the budget', () => {
    expect(chunkCode('a\nb\nc', 100)).toEqual(['a\nb\nc']);
  });
  it('splits at line boundaries and loses no content', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`);
    const chunks = chunkCode(lines.join('\n'), 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(30);
    expect(chunks.join('\n').split('\n')).toEqual(lines); // every line preserved, in order
  });
  it('keeps a single over-long line as its own chunk', () => {
    const long = 'x'.repeat(50);
    expect(chunkCode(long, 10)).toEqual([long]);
  });
});
