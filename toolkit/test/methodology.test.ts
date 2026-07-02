import { describe, it, expect } from 'vitest';
import { DISTILL_METHODOLOGY } from '../src/atomize/methodology.js';

describe('DISTILL_METHODOLOGY', () => {
  it('is a non-trivial instruction block', () => {
    expect(DISTILL_METHODOLOGY.length).toBeGreaterThan(400);
  });

  it('carries the load-bearing rules that keep notes good', () => {
    const text = DISTILL_METHODOLOGY.toLowerCase();
    // atomic — one idea per note
    expect(text).toContain('one idea per note');
    // the phantom-wikilink prohibition (the highest-value rule)
    expect(text).toContain('[[');
    expect(text).toMatch(/phantom|illustrative|example/);
    // update-vs-create-vs-skip
    expect(text).toContain('update');
    expect(text).toContain('skip');
    // citations are mandatory
    expect(text).toContain('citation');
  });
});
