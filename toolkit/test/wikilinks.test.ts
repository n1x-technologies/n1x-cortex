import { describe, it, expect } from 'vitest';
import { extractLinks } from '../src/wikilinks.js';

describe('extractLinks', () => {
  it('extracts targets and strips alias/anchor', () => {
    const body = 'See [[FLOW-Login]] and [[RULE-01|the rule]] and [[Note#section]].';
    expect(extractLinks(body).map(l => l.target)).toEqual(['FLOW-Login', 'RULE-01', 'Note']);
  });

  it('attaches the nearest heading above each link', () => {
    const body = '# Top\n\n[[A]]\n\n## Relacionadas\n\n[[B]] [[C]]';
    const links = extractLinks(body);
    expect(links.find(l => l.target === 'A')?.heading).toBe('Top');
    expect(links.find(l => l.target === 'B')?.heading).toBe('Relacionadas');
    expect(links.find(l => l.target === 'C')?.heading).toBe('Relacionadas');
  });

  it('returns an empty array when there are no links', () => {
    expect(extractLinks('plain text, no links')).toEqual([]);
  });
});
