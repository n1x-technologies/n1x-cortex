import { describe, it, expect } from 'vitest';
import { excerpt } from '../src/query/excerpt.js';

describe('excerpt', () => {
  it('returns the line with the most query-term matches', () => {
    const body = '# Title\n\nIntro line.\nThe applicable limit for an operation is 5 units.\nUnrelated trailing line.';
    expect(excerpt(body, 'operation limit')).toBe('The applicable limit for an operation is 5 units.');
  });
  it('falls back to the first content line when nothing matches', () => {
    const body = '# Title\n\nFirst real line.\nSecond line.';
    expect(excerpt(body, 'zzz')).toBe('First real line.');
  });
  it('truncates long lines with an ellipsis', () => {
    const long = 'x'.repeat(300);
    const out = excerpt(`# T\n\n${long}`, 'x', 50);
    expect(out.length).toBe(50);
    expect(out.endsWith('…')).toBe(true);
  });
});
