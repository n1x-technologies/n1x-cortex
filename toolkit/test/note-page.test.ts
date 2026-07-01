import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderNotePage, renderNotFound } from '../src/viz/notePage.js';

describe('notePage', () => {
  it('renders markdown to html', () => {
    const html = renderMarkdown('# Hi\n\n**bold** text');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
  });
  it('rewrites wikilinks to /note/ links', () => {
    const html = renderMarkdown('see [[alpha]] and [[beta|B]]');
    expect(html).toContain('href="/note/alpha"');
    expect(html).toContain('href="/note/beta"');
    expect(html).toContain('>B</a>');
  });
  it('renderNotePage includes escaped title + body + meta', () => {
    const note = { id: 'n1', title: 'A & B', type: 'concept', status: 'draft', folder: '', path: 'n1.md' } as any;
    const page = renderNotePage(note, '<p>hello</p>');
    expect(page).toContain('A &amp; B');
    expect(page).toContain('<p>hello</p>');
    expect(page).toContain('concept · draft');
  });
  it('renderNotFound escapes the id', () => {
    expect(renderNotFound('<x>')).toContain('&lt;x&gt;');
  });
});
