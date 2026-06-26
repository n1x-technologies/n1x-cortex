import type { Note } from '../types.js';

export function noteText(note: Note): string {
  return `${note.title}\n${note.body}`.trim();
}
export function passageText(note: Note): string {
  return `passage: ${noteText(note)}`;
}
export function queryText(question: string): string {
  return `query: ${question}`;
}
