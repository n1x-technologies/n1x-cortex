import { describe, it, expect } from 'vitest';
import { extractLinks, stripLinkSyntax } from '../src/wikilinks.js';

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

  it('strips an Obsidian table-escaped pipe (\\|) from the target', () => {
    // Inside Markdown tables Obsidian requires escaping the alias pipe as \| so
    // the column separator is not broken. The target must drop the backslash.
    const body = '| col | [[IA-OPS-01-asignacion\\|IA de asignación]] | end |';
    expect(extractLinks(body).map(l => l.target)).toEqual(['IA-OPS-01-asignacion']);
  });

  it('handles an escaped pipe combined with an anchor', () => {
    expect(extractLinks('[[Target\\|alias#sec]]').map(l => l.target)).toEqual(['Target']);
  });

  it('still parses an unescaped alias pipe (non-table links)', () => {
    expect(extractLinks('[[RULE-02\\|aliased]] and [[RULE-03|plain]]').map(l => l.target))
      .toEqual(['RULE-02', 'RULE-03']);
  });
});

describe('stripLinkSyntax', () => {
  it('drops the raw link target, which is a filename slug and not prose', () => {
    expect(stripLinkSyntax('Ver [[reunion-directorio-2026-q1]] para detalles.'))
      .toBe('Ver  para detalles.');
  });

  it('keeps the alias, which is prose the author actually wrote', () => {
    expect(stripLinkSyntax('Ver [[reunion-directorio-2026-q1|la última reunión]] para detalles.'))
      .toBe('Ver la última reunión para detalles.');
  });
});
