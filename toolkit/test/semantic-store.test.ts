import { describe, it, expect } from 'vitest';
import { hashContent, loadStore, saveStore, storeMap, type EmbeddingStore } from '../src/semantic/store.js';
import { noteText, passageText, queryText } from '../src/semantic/text.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Note } from '../src/types.js';

const note = (over: Partial<Note> = {}): Note => ({
  path: 'N/a.md', id: 'A', title: 'Alpha', type: null, status: null, tags: [],
  meta: {}, folder: 'N', links: [], source: null, body: 'hello world', ...over,
});

describe('embedding store', () => {
  it('hashes content deterministically and changes on edit', () => {
    expect(hashContent('x')).toBe(hashContent('x'));
    expect(hashContent('x')).not.toBe(hashContent('y'));
  });
  it('round-trips a store and returns null when absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-store-'));
    expect(loadStore(dir)).toBeNull();
    const store: EmbeddingStore = { model: 'm', dim: 2, records: [{ path: 'N/a.md', hash: 'h', vector: [1, 2] }] };
    saveStore(dir, store);
    const back = loadStore(dir);
    expect(back).not.toBeNull();
    expect(storeMap(back!).get('N/a.md')!.vector).toEqual([1, 2]);
  });
  it('builds note/passage/query text with e5 prefixes', () => {
    expect(noteText(note())).toBe('Alpha\nhello world');
    expect(passageText(note())).toBe('passage: Alpha\nhello world');
    expect(queryText('find things')).toBe('query: find things');
  });
});
