// toolkit/test/md2typ.test.ts
import { describe, it, expect } from 'vitest';
import { mdToTyp } from '../src/curate/md2typ.js';

describe('mdToTyp', () => {
  it('shifts headings by the given amount', () => {
    expect(mdToTyp('# Title', 1)).toBe('== Title');
    expect(mdToTyp('## Sub', 1)).toBe('=== Sub');
  });
  it('converts emphasis, wikilinks, and bullets', () => {
    expect(mdToTyp('**bold**', 0)).toBe('*bold*');
    expect(mdToTyp('*italic*', 0)).toBe('_italic_');
    expect(mdToTyp('[[Note|Alias]]', 0)).toBe('*Alias*');
    expect(mdToTyp('[[Note]]', 0)).toBe('*Note*');
    expect(mdToTyp('- item', 0)).toBe('- item');
  });
  it('escapes stray Typst specials', () => {
    expect(mdToTyp('cost is #5 and @ten', 0)).toBe('cost is \\#5 and \\@ten');
  });
});
