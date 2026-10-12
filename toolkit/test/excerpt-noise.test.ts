// That the citation is not a link nor the source footer.
//
// Both share words with the question while saying nothing: a wikilink's slug
// repeats the title of the note it points at, and the `*Source: [[…]]*` footer
// repeats the source's. Measured on a real vault, a query about a policy
// returned a link to another note and a source footer as its first two
// citations, with the content third.

import { describe, it, expect } from 'vitest';
import { bestLine, excerpt } from '../src/query/excerpt.js';

describe('the citation leaves out what says nothing', () => {
  it('does not cite a line that is only a wikilink', () => {
    // Both lines share "travel" and "policy" — the link's slug repeats the
    // title — so the only thing that makes the content win is the filter.
    // Without it, the citation was the link.
    const body = [
      '[[Travel policy — meal and lodging caps]]',
      'The travel policy sets a daily cap of 45 USD outside the capital.',
    ].join('\n');
    expect(bestLine(body, 'travel policy')).toContain('45 USD');
  });

  it('does not cite the source footer cortex writes', () => {
    const body = [
      '*Source: [[travel-policy-draft]]*',
      'Travel expenses are filed within 10 business days.',
    ].join('\n');
    expect(bestLine(body, 'travel policy')).toContain('10 business days');
  });

  it('several links on one line are left out too', () => {
    const body = [
      '[[One on travel]] · [[Two on travel]], [[Three on travel]]',
      'Here the travel policy is actually explained.',
    ].join('\n');
    expect(bestLine(body, 'travel')).toContain('actually explained');
  });

  it('a link with words of its own around it is cited', () => {
    // The filter is for lines WITHOUT a word of their own; a sentence that
    // mentions a link is a sentence.
    const body = 'The cap comes from [[Travel policy]] and is reviewed each year.';
    expect(bestLine(body, 'travel policy')).toContain('reviewed each year');
  });

  it('a note that is only links does not end up with no citation', () => {
    // A map of content: filtering everything would leave the citation empty,
    // which is worse than citing a link.
    const moc = ['[[One on travel]]', '[[Two on travel]]'].join('\n');
    expect(bestLine(moc, 'travel')).toContain('travel');
    expect(excerpt(moc, 'nothing related')).toContain('One');
  });

  it('a note that is only the source footer does not either', () => {
    expect(excerpt('*Source: [[something]]*', 'something')).toContain('Source');
  });
});
