import { tokenize } from '../search/tokenize.js';

/** The footer `atomize/render.ts` puts on every note it generates. */
const SOURCE_FOOTER_ONLY = /^\*Source:\s*\[\[[^\]]*\]\]\*$/;

/** A line made only of wikilinks and separators, with no word of its own. */
const LINKS_ONLY = /^(?:\[\[[^\]]+\]\][\s,;·|–—-]*)+$/;

/**
 * The lines that can be cited.
 *
 * Besides headings, frontmatter and block quotes, two kinds of line are left
 * out because they share words with the question and say nothing: the
 * `*Source: [[…]]*` footer cortex writes on each note it generates, and lines
 * that are pure wikilink. Both were winning real citations — measured, a
 * question about a policy returned the link to another note and the source
 * footer as its first two citations, with the content third — because a link's
 * slug repeats the words of the title it points at.
 *
 * If filtering leaves nothing, every line is returned: a note that is only
 * links — a map of content — has no reason to end up with no citation.
 */
function lines(body: string): string[] {
  const all = body.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('> '));
  const withWords = all.filter(l => !SOURCE_FOOTER_ONLY.test(l) && !LINKS_ONLY.test(l));
  return withWords.length ? withWords : all;
}

const clip = (text: string, maxLen: number) =>
  text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;

/**
 * The line that shares most with the question, or `null` if none shares anything.
 *
 * ── Distinct terms, not occurrences ────────────────────────────────────────
 *
 * What is counted is how many words OF THE QUESTION appear in the line, not how
 * many times they appear. Counting times is the same disease the lexical
 * ranking had — rewarding repetition — and in a long document it shows:
 * measured on an imported document, against a five-term question the line that
 * won by occurrences repeated one term five times and covered two of the five,
 * while the line covering three — the one carrying the figures that were asked
 * about — was left out.
 *
 * Ties keep document order, which is as good a rule as any and invents none.
 *
 * ── Why it returns `null` ──────────────────────────────────────────────────
 *
 * This is the reason it is separate from `excerpt`. When no line holds a single
 * word of the question, `excerpt` returns the document's first line: in an
 * atomic note that is a fair approximation, and in a note of two hundred
 * thousand characters it is the cover page. Anything with something better than
 * the cover page — the passage the note appeared for, say — needs to know that
 * case was reached, and a string cannot say so.
 */
export function bestLine(body: string, query: string, maxLen = 200): string | null {
  const qset = new Set(tokenize(query));
  let best: string | null = null;
  let bestScore = 0;
  for (const line of lines(body)) {
    const score = new Set(tokenize(line).filter(t => qset.has(t))).size;
    if (score > bestScore) { bestScore = score; best = line; }
  }
  return best === null ? null : clip(best, maxLen);
}

export function excerpt(body: string, query: string, maxLen = 200): string {
  return bestLine(body, query, maxLen) ?? clip(lines(body)[0] ?? '', maxLen);
}
