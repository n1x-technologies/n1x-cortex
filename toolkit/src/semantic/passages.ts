// Splitting a note into passages, so a long note can be queried whole.
//
// ── The problem ────────────────────────────────────────────────────────────
//
// `embed.ts` embedded each note as ONE vector over `title + body`. The model —
// e5-small and others its size — attends 512 tokens, about two thousand
// characters. For an atomic note that is room to spare. For an imported
// document of two hundred thousand characters it means the vector describes the
// first page and the rest of the document is not indexed: it does not rank low,
// it is not there.
//
// Measured on a document that size: a question answered by a section a hundred
// and eighty thousand characters deep did not return that note in any position
// — not in the first six, not in the first twenty.
//
// ── Why paragraphs and not every N characters ──────────────────────────────
//
// Because a blind cut lands in the worst possible place. A long document tends
// to state a figure in one sentence and what follows from it in the next, and a
// cut between them leaves two passages of which neither answers. Paragraph
// boundaries were already put there by whoever wrote the document, and in one
// numbered by sections they are exactly the unit of meaning.
//
// A heading always opens a passage, and the heading trail in force is prefixed
// to the text that gets embedded. That is what makes a paragraph usable when it
// cannot stand alone: a figure with no name for the thing it measures answers
// nothing, and under its heading it stops being anonymous.
//
// ── Why there is no overlap ────────────────────────────────────────────────
//
// Overlap is the usual choice, and here it buys little: what it rescues is a
// fact split by a cut, and these cuts fall between paragraphs. In exchange it
// would duplicate every passage in the ranking and make one paragraph compete
// with itself. If a corpus without paragraphs turns up, this gets revisited
// with that measurement in hand and not before.

import type { Note } from '../types.js';

/**
 * How much text goes in one passage.
 *
 * Sixteen hundred characters is about four hundred tokens: comfortably under
 * the 512 the model reads, with room for the `passage: ` prefix, the note's
 * title and the heading trail prefixed to it.
 */
export const MAX_CHARS = 1600;

export interface Passage {
  /** Position of the passage within the note, from 0. */
  idx: number;
  /** Where it starts and ends in `note.body`, so a citation can come from there. */
  start: number;
  end: number;
  /** The text that gets embedded: title, heading trail, then the body. */
  text: string;
}

interface Block { start: number; end: number; text: string; heading: boolean }

const HEADING = /^#{1,6}\s+/;

/**
 * The note's blocks, with their offsets.
 *
 * A block is a paragraph, or a heading on its own. The offsets kept are the
 * real ones in the body — not those of the trimmed text — because that is what
 * later allows a citation to come from the passage that won rather than from
 * the whole note.
 */
function blocks(body: string): Block[] {
  const out: Block[] = [];
  let pos = 0;
  let start = -1;
  let end = -1;
  const close = () => {
    if (start < 0) return;
    const text = body.slice(start, end).trim();
    if (text) out.push({ start, end, text, heading: false });
    start = -1;
    end = -1;
  };
  for (const line of body.split('\n')) {
    const from = pos;
    pos += line.length + 1;
    const clean = line.trim();
    if (!clean) { close(); continue; }
    if (HEADING.test(clean)) {
      close();
      out.push({ start: from, end: from + line.length, text: clean, heading: true });
      continue;
    }
    if (start < 0) start = from;
    end = from + line.length;
  }
  close();
  return out;
}

/** The heading trail in force, shallowest first. */
function trail(stack: string[]): string {
  return stack.filter(Boolean).join(' › ');
}

/** How many `#` a heading carries. */
function level(line: string): number {
  const m = line.match(/^(#{1,6})/);
  return m ? m[1].length : 1;
}

/**
 * Splits a paragraph that does not fit on its own, cutting between sentences.
 *
 * A five thousand character paragraph exists — text transcribed from a document
 * without a single line break — and it has to be split anyway. Between
 * sentences is the least bad of the blind cuts, and with no sentence ends at all
 * it is cut by size, which is worse than a paragraph and far better than
 * indexing nothing.
 */
function splitLong(b: Block, max: number): Block[] {
  if (b.text.length <= max) return [b];
  const out: Block[] = [];
  // Cut AFTER the stop, so a sentence keeps its own ending.
  const pieces = b.text.split(/(?<=[.;:!?])\s+/);
  let held = '';
  let from = 0;
  const push = () => {
    if (!held.trim()) return;
    out.push({ start: b.start + from, end: b.start + from + held.length, text: held.trim(), heading: false });
    from += held.length;
    held = '';
  };
  for (const piece of pieces) {
    const next = held ? ` ${piece}` : piece;
    if (held && held.length + next.length > max) push();
    if (piece.length > max) {
      // A single sentence longer than the budget: by size, and that is all.
      for (let i = 0; i < piece.length; i += max) {
        held = piece.slice(i, i + max);
        push();
      }
      continue;
    }
    held += held ? ` ${piece}` : piece;
  }
  push();
  return out;
}

/**
 * A note's passages.
 *
 * Always returns at least one. A note that fits the budget returns exactly one,
 * and that is the rule `embed.ts` relies on to store no extra vectors: with a
 * single passage, the note's own vector already covers it.
 */
export function splitPassages(note: Note, { maxChars = MAX_CHARS }: { maxChars?: number } = {}): Passage[] {
  const body = note.body ?? '';
  const parts = blocks(body).flatMap((b) => (b.heading ? [b] : splitLong(b, maxChars)));
  if (!parts.length) {
    return [{ idx: 0, start: 0, end: body.length, text: note.title || body.slice(0, maxChars) }];
  }

  const passages: Passage[] = [];
  const stack: string[] = [];
  let current: Block[] = [];
  let headings = '';
  let length = 0;

  const close = () => {
    if (!current.length) return;
    const head = [note.title, headings].filter(Boolean).join(' › ');
    const text = current.map((b) => b.text).join('\n\n');
    passages.push({
      idx: passages.length,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: head ? `${head}\n\n${text}` : text,
    });
    current = [];
    length = 0;
  };

  for (const b of parts) {
    if (b.heading) {
      // A heading opens a passage: what comes below it is a different thing
      // from what came above, and joining them mixes two sections in one vector.
      close();
      const n = level(b.text);
      stack.length = Math.max(0, n - 1);
      stack[n - 1] = b.text.replace(HEADING, '').trim();
      headings = trail(stack);
      continue;
    }
    if (length && length + b.text.length > maxChars) {
      close();
      headings = trail(stack);
    }
    current.push(b);
    length += b.text.length;
  }
  close();

  // A note that is only headings leaves no passage at all: what remains is the
  // title, the one thing it says, instead of an empty list the caller would
  // have to treat as a case of its own.
  if (!passages.length) {
    return [{ idx: 0, start: 0, end: body.length, text: [note.title, trail(stack)].filter(Boolean).join(' › ') }];
  }
  return passages;
}
