// The store changed shape. The one thing that must not change is the answer.
//
// Vectors used to be written as decimal text inside `index.json` and now go out
// as raw Float32. If a single value came back different, every cosine built on
// it moves, and search would start returning a different order for the same
// question — the kind of regression nobody notices until somebody cannot find a
// document they know is there. So the tests here are mostly about sameness:
// same values, same rankings, same behaviour on a vault written by the old
// version.
//
// The second half is about the two files disagreeing. A store split across a
// catalogue and a binary can be half-copied, half-synced or cut by a crash
// between two renames, and every one of those used to load without a word —
// either with empty vectors or with each note wearing a neighbour's vector.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  hashContent, loadStore, loadStoreMeta, readStore, saveStore, storeMap, storePath, vectorsPath,
  type EmbeddingStore,
} from '../src/semantic/store.js';
import { cosineDense } from '../src/semantic/cosine.js';
import { noteText, passageText, queryText } from '../src/semantic/text.js';
import type { Note } from '../src/types.js';

const note = (over: Partial<Note> = {}): Note => ({
  path: 'N/a.md', id: 'A', title: 'Alpha', type: null, status: null, tags: [],
  meta: {}, folder: 'N', links: [], source: null, body: 'hello world', ...over,
});

const dir = (): string => mkdtempSync(join(tmpdir(), 'cortex-store-'));

/**
 * A store shaped like a real one: unit-norm float32 vectors, 384 dimensions,
 * repeatable. Float32 on purpose — that is what the embedder hands over, and
 * the whole round-trip argument rests on the values already being float32
 * before anybody writes them anywhere.
 */
function fakeStore(n: number, dim = 384, seed = 20260909): EmbeddingStore {
  let s = seed;
  const rnd = (): number => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - 0.5; };
  const records = Array.from({ length: n }, (_, i) => {
    const v = new Float32Array(dim);
    let norm = 0;
    for (let j = 0; j < dim; j++) { v[j] = rnd(); norm += v[j] * v[j]; }
    norm = Math.sqrt(norm);
    for (let j = 0; j < dim; j++) v[j] = v[j] / norm;
    return { path: `notes/n${i}.md`, hash: hashContent(`n${i}`), vector: v };
  });
  return { model: 'Xenova/multilingual-e5-small', dim, records };
}

/** Rewrites fields of a saved catalogue in place. */
function editCatalogue(embedDir: string, fields: Record<string, unknown>): void {
  const cat = JSON.parse(readFileSync(storePath(embedDir), 'utf8'));
  writeFileSync(storePath(embedDir), JSON.stringify({ ...cat, ...fields }));
}

/** The store as the previous version wrote it: vectors inline, as JSON text. */
function writeLegacy(embedDir: string, store: EmbeddingStore): void {
  writeFileSync(storePath(embedDir), JSON.stringify({
    model: store.model,
    dim: store.dim,
    records: store.records.map((r) => ({ path: r.path, hash: r.hash, vector: Array.from(r.vector) })),
  }));
}

describe('embedding store', () => {
  it('hashes content deterministically and changes on edit', () => {
    expect(hashContent('x')).toBe(hashContent('x'));
    expect(hashContent('x')).not.toBe(hashContent('y'));
  });

  it('round-trips a store and returns null when absent', () => {
    const d = dir();
    expect(loadStore(d)).toBeNull();
    const store: EmbeddingStore = { model: 'm', dim: 2, records: [{ path: 'N/a.md', hash: 'h', vector: [1, 2] }] };
    saveStore(d, store);
    const back = loadStore(d);
    expect(back).not.toBeNull();
    expect(Array.from(storeMap(back!).get('N/a.md')!.vector)).toEqual([1, 2]);
  });

  it('reports no problem for a directory that simply has no store yet', () => {
    expect(readStore(dir())).toEqual({ store: null, problem: null });
  });

  it('round-trips an empty store as empty, not as absent', () => {
    const d = dir();
    saveStore(d, { model: 'm', dim: 0, records: [] });
    const back = readStore(d);
    expect(back.problem).toBeNull();
    expect(back.store).not.toBeNull();
    expect(back.store!.records).toEqual([]);
  });

  it('refuses to save a vector whose length is not the store dimension', () => {
    // Padding it with zeros, or truncating it, writes a vector that was never
    // produced by any model and ranks it as if it had been.
    const d = dir();
    const store: EmbeddingStore = {
      model: 'm', dim: 3,
      records: [{ path: 'a', hash: 'h', vector: [1, 2, 3] }, { path: 'b', hash: 'h', vector: [9] }],
    };
    expect(() => saveStore(d, store)).toThrow(/b.*1.*3/);
    expect(existsSync(storePath(d))).toBe(false);
  });

  it('refuses to save vectors that disagree with the dimension the store declares', () => {
    const d = dir();
    const store: EmbeddingStore = { model: 'm', dim: 3, records: [{ path: 'a', hash: 'h', vector: [1, 2] }] };
    expect(() => saveStore(d, store)).toThrow(/a.*2.*3/);
  });

  it('refuses to save records whose vectors are empty', () => {
    // An endpoint that answers with `embedding: []` produces exactly this. Saved,
    // it is a store the reader refuses — so the embed that wrote it reported
    // success and every query after it quietly lost its semantic half.
    const d = dir();
    const store: EmbeddingStore = { model: 'm', dim: 0, records: [{ path: 'a', hash: 'h', vector: [] }] };
    expect(() => saveStore(d, store)).toThrow(/no dimension/);
    expect(existsSync(storePath(d))).toBe(false);
  });

  it('builds note/passage/query text with e5 prefixes', () => {
    expect(noteText(note())).toBe('Alpha\nhello world');
    expect(passageText(note())).toBe('passage: Alpha\nhello world');
    expect(queryText('find things')).toBe('query: find things');
  });
});

describe('the vectors survive the new format exactly', () => {
  it('gives back every value bit for bit', () => {
    const d = dir();
    const store = fakeStore(200);
    saveStore(d, store);
    const back = loadStore(d)!;
    expect(back.records).toHaveLength(store.records.length);
    for (let i = 0; i < store.records.length; i++) {
      expect(back.records[i].path).toBe(store.records[i].path);
      expect(back.records[i].hash).toBe(store.records[i].hash);
      const before = store.records[i].vector;
      const after = back.records[i].vector;
      expect(after.length).toBe(before.length);
      for (let j = 0; j < before.length; j++) expect(after[j]).toBe(before[j]);
    }
  });

  it('ranks in exactly the same order as the old JSON format', () => {
    // This is the test that matters. Two directories, same vectors, one written
    // the old way and one the new; every note is scored against every other and
    // the two orderings have to be the same list, not a similar one.
    const store = fakeStore(120);
    const legacyDir = dir();
    const currentDir = dir();
    writeLegacy(legacyDir, store);
    saveStore(currentDir, store);

    const a = loadStore(legacyDir)!;
    const b = loadStore(currentDir)!;
    const probe = a.records[0].vector;

    const ranking = (s: EmbeddingStore): Array<[string, number]> => s.records
      .map((r) => [r.path, cosineDense(probe, r.vector)] as [string, number])
      .sort((x, y) => y[1] - x[1]);

    const ra = ranking(a);
    const rb = ranking(b);
    expect(rb.map(([p]) => p)).toEqual(ra.map(([p]) => p));
    for (let i = 0; i < ra.length; i++) expect(rb[i][1]).toBe(ra[i][1]);
  });

  it('can be saved again over itself, from the vectors it just loaded', () => {
    // `embed` does exactly this: the reused vectors are views over the buffer
    // read from vectors.bin, and they are written back into the same path.
    const d = dir();
    const store = fakeStore(20);
    saveStore(d, store);
    saveStore(d, loadStore(d)!);
    const back = loadStore(d)!;
    for (let i = 0; i < 20; i++) expect(Array.from(back.records[i].vector)).toEqual(Array.from(store.records[i].vector));
  });
});

describe('a vault written by the previous version', () => {
  it('still loads, with the vectors that were inside the JSON', () => {
    const d = dir();
    const store = fakeStore(30);
    writeLegacy(d, store);
    expect(existsSync(vectorsPath(d))).toBe(false);
    const back = loadStore(d)!;
    expect(back.records).toHaveLength(30);
    expect(back.dim).toBe(384);
    for (let j = 0; j < 384; j++) expect(back.records[5].vector[j]).toBe(store.records[5].vector[j]);
  });

  it('moves across on the next save, without changing a value', () => {
    const d = dir();
    const store = fakeStore(30);
    writeLegacy(d, store);
    const before = loadStore(d)!;
    saveStore(d, before);
    expect(existsSync(vectorsPath(d))).toBe(true);
    // And the catalogue stopped carrying the vectors: that is the whole point.
    const cat = JSON.parse(readFileSync(storePath(d), 'utf8'));
    expect(cat.records[0].vector).toBeUndefined();
    expect(cat.format).toBe(2);
    const after = loadStore(d)!;
    for (let i = 0; i < 30; i++) {
      for (let j = 0; j < 384; j++) expect(after.records[i].vector[j]).toBe(store.records[i].vector[j]);
    }
  });

  it('uses its own inline vectors even when a stray vectors.bin sits beside it', () => {
    // A migration cut between the two renames leaves the new vectors.bin next
    // to the old catalogue. The old catalogue is self-contained — it carries
    // its own vectors — so those are the ones that are right.
    const d = dir();
    const store = fakeStore(10);
    writeLegacy(d, store);
    const other = dir();
    saveStore(other, fakeStore(10, 384, 1));
    copyFileSync(vectorsPath(other), vectorsPath(d));
    const back = loadStore(d)!;
    for (let i = 0; i < 10; i++) expect(Array.from(back.records[i].vector)).toEqual(Array.from(store.records[i].vector));
  });

  it('is refused when every vector is empty', () => {
    const d = dir();
    writeFileSync(storePath(d), JSON.stringify({ model: 'm', records: [{ path: 'a', hash: 'h', vector: [] }] }));
    expect(readStore(d).problem).toMatch(/no usable dimension/);
    expect(loadStoreMeta(d)).toBeNull();
  });

  it('is refused when a record carries no vector', () => {
    const d = dir();
    writeFileSync(storePath(d), JSON.stringify({ model: 'm', dim: 2, records: [{ path: 'a', hash: 'h' }] }));
    const r = readStore(d);
    expect(r.store).toBeNull();
    expect(r.problem).toMatch(/vector/);
  });
});

describe('the catalogue on its own', () => {
  it('reads path and hash without reading the vectors', () => {
    const d = dir();
    const store = fakeStore(50);
    saveStore(d, store);
    const meta = loadStoreMeta(d)!;
    expect(meta.records).toHaveLength(50);
    expect(meta.dim).toBe(384);
    expect(meta.records[7].hash).toBe(store.records[7].hash);
  });
});

describe('a catalogue and a vectors file that do not belong together are refused', () => {
  // Each of these used to load. Every case is checked through both entry
  // points: `loadStoreMeta` is what decides "these notes are up to date", and if
  // it vouches for a store `loadStore` rejects, the notes are never re-embedded.
  const cases: Array<[string, (d: string) => void, RegExp]> = [
    ['the vectors file is missing', (d) => rmSync(vectorsPath(d)), /vectors\.bin/],
    ['the vectors file is cut short', (d) => {
      const bin = readFileSync(vectorsPath(d));
      writeFileSync(vectorsPath(d), bin.subarray(0, Math.floor(bin.length / 2)));
    }, /size/],
    ['the vectors file has bytes past the last record', (d) => {
      const bin = readFileSync(vectorsPath(d));
      writeFileSync(vectorsPath(d), Buffer.concat([bin, Buffer.alloc(384 * 4)]));
    }, /size/],
    ['the vectors file is from another save of the same size', (d) => {
      // Same record count, same dimension, different order: the length check
      // alone passes this, and every note would take another note's vector.
      const other = dir();
      const s = fakeStore(40);
      saveStore(other, { ...s, records: [...s.records].reverse() });
      copyFileSync(vectorsPath(other), vectorsPath(d));
    }, /different save/],
    ['the vectors file is not a vectors file', (d) => writeFileSync(vectorsPath(d), Buffer.alloc(40 * 384 * 4 + 16)), /not a cortex vectors file/],
    // The next two keep the generation and the size right, so only the header
    // check itself can refuse them.
    ['the header tag is wrong', (d) => {
      const bin = readFileSync(vectorsPath(d));
      bin.write('XXXX', 0, 'ascii');
      writeFileSync(vectorsPath(d), bin);
    }, /not a cortex vectors file/],
    ['the header format is wrong', (d) => {
      const bin = readFileSync(vectorsPath(d));
      bin.writeUInt32LE(3, 4);
      writeFileSync(vectorsPath(d), bin);
    }, /not a cortex vectors file/],
    ['the vectors file is shorter than its header', (d) => writeFileSync(vectorsPath(d), Buffer.from('CXVB\x02\x00', 'latin1')), /not a cortex vectors file/],
    ['the vectors file is a directory', (d) => { rmSync(vectorsPath(d)); mkdirSync(vectorsPath(d)); }, /could not be read/],
    ['the catalogue dimension is not an integer', (d) => editCatalogue(d, { dim: 3.5 }), /no usable dimension/],
    ['the catalogue dimension is a string', (d) => editCatalogue(d, { dim: '384' }), /no usable dimension/],
    ['the catalogue dimension is 0 with records in it', (d) => editCatalogue(d, { dim: 0 }), /no usable dimension/],
    ['the catalogue is from a newer format', (d) => editCatalogue(d, { format: 3 }), /format 3/],
    ['the catalogue format is not a number', (d) => editCatalogue(d, { format: '2' }), /format "2"/],
  ];

  for (const [name, corrupt, problem] of cases) {
    it(`when ${name}`, () => {
      const d = dir();
      saveStore(d, fakeStore(40));
      corrupt(d);
      const r = readStore(d);
      expect(r.store).toBeNull();
      expect(r.problem).toMatch(problem);
      expect(loadStore(d)).toBeNull();
      expect(loadStoreMeta(d)).toBeNull();
    });
  }

  it('when an empty store has vectors after its header', () => {
    const d = dir();
    saveStore(d, { model: 'm', dim: 0, records: [] });
    writeFileSync(vectorsPath(d), Buffer.concat([readFileSync(vectorsPath(d)), Buffer.alloc(384 * 4)]));
    expect(readStore(d).problem).toMatch(/size/);
    expect(loadStoreMeta(d)).toBeNull();
  });

  it('returns null on a catalogue that is not a store', () => {
    const d = dir();
    writeFileSync(storePath(d), '{"nope":1}');
    expect(loadStore(d)).toBeNull();
    expect(loadStoreMeta(d)).toBeNull();
    expect(readStore(d).problem).toMatch(/index\.json/);
  });
});

describe('the size that started all this', () => {
  it('costs about five times less on disk than the JSON did', () => {
    // 384 float32 values are 1,536 bytes as binary against roughly 8 KB as
    // decimal JSON. The wall this removes is the longest string V8 can make,
    // which the JSON store passed at about 65,000 notes.
    const d = dir();
    const store = fakeStore(500);
    const legacyDir = dir();
    writeLegacy(legacyDir, store);
    saveStore(d, store);

    const before = readFileSync(storePath(legacyDir)).length;
    const after = readFileSync(storePath(d)).length + readFileSync(vectorsPath(d)).length;
    expect(after).toBeLessThan(before / 3);
    // And what still has to be read AS TEXT — the part with the string limit —
    // is now a small fraction of it.
    expect(readFileSync(storePath(d)).length).toBeLessThan(before / 20);
  });
});
