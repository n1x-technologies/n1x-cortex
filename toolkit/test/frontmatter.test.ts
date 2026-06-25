import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../src/frontmatter.js';

describe('parseFrontmatter', () => {
  it('splits YAML frontmatter from the body', () => {
    const md = '---\ntipo: regla\nestado: documentado\n---\n# Title\n\nBody text.';
    const { data, body } = parseFrontmatter(md);
    expect(data.tipo).toBe('regla');
    expect(data.estado).toBe('documentado');
    expect(body.trim()).toBe('# Title\n\nBody text.');
  });

  it('returns empty data when there is no frontmatter', () => {
    const { data, body } = parseFrontmatter('# Just a title');
    expect(data).toEqual({});
    expect(body.trim()).toBe('# Just a title');
  });
});
