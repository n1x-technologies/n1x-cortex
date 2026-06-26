import { tokenize } from '../search/tokenize.js';

export function excerpt(body: string, query: string, maxLen = 200): string {
  const qset = new Set(tokenize(query));
  const lines = body.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('> '));

  let best = '';
  let bestScore = -1;
  for (const line of lines) {
    const score = tokenize(line).filter(t => qset.has(t)).length;
    if (score > bestScore) { bestScore = score; best = line; }
  }
  if (bestScore <= 0) best = lines[0] ?? '';
  return best.length > maxLen ? best.slice(0, maxLen - 1) + '…' : best;
}
