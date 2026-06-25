import matter from 'gray-matter';

export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const parsed = matter(content);
  return { data: parsed.data as Record<string, unknown>, body: parsed.content };
}
