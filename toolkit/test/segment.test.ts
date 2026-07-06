import { describe, it, expect } from 'vitest';
import { segmentSource } from '../src/atomize/segment.js';

describe('segmentSource', () => {
  it('splits a markdown source into one segment per heading with its body', () => {
    const src = '# Title\n\nIntro under title.\n\n## Rule A\n\nBody of A.\nMore A.\n\n## Rule B\n\nBody of B.';
    const segs = segmentSource(src);
    expect(segs.map(s => s.heading)).toEqual(['Title', 'Rule A', 'Rule B']);
    expect(segs.find(s => s.heading === 'Rule A')?.body.trim()).toBe('Body of A.\nMore A.');
    expect(segs.find(s => s.heading === 'Rule A')?.level).toBe(2);
  });
  it('ignores frontmatter and returns [] when there are no headings', () => {
    expect(segmentSource('---\nx: 1\n---\njust text, no headings')).toEqual([]);
  });
});
