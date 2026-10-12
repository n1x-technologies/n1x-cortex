import type { Note } from '../types.js';

export function noteText(note: Note): string {
  return `${note.title}\n${note.body}`.trim();
}
export function passageText(note: Note): string {
  return `passage: ${noteText(note)}`;
}
/**
 * One passage's text, ready to embed.
 *
 * It carries the same `passage: ` prefix a whole note does — e5 models want it
 * to tell a document from a question — but it does NOT prefix the title again:
 * `splitPassages` already put the title and the heading trail in front, and
 * repeating it would give the title triple weight inside the window.
 */
export function chunkText(text: string): string {
  return `passage: ${text}`;
}

export function queryText(question: string): string {
  return `query: ${question}`;
}
