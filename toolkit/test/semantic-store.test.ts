// The store changed shape. The one thing that must not change is the answer.
//
// Vectors used to be written as decimal text inside `index.json` and now go out
// as raw Float32. If a single value came back different, every cosine built on
// it moves, and search would start returning a different order for the same
// question — the kind of regression nobody notices until somebody cannot find a
// document they know is there. So the tests here are mostly about sameness:
// same values, same rankings, same behaviour on a vault written by the old
// version.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  hashContent, loadStore, loadStoreMeta, saveStore, storeMap, storePath, vectorsPath,
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
      const antes = store.records[i].vector;
      const ahora = back.records[i].vector;
      expect(ahora.length).toBe(antes.length);
      for (let j = 0; j < antes.length; j++) expect(ahora[j]).toBe(antes[j]);
    }
  });

  it('ranks in exactly the same order as the old JSON format', () => {
    // This is the test that matters. Two directories, same vectors, one written
    // the old way and one the new; every note is scored against every other and
    // the two orderings have to be the same list, not a similar one.
    const store = fakeStore(120);
    const viejo = dir();
    const nuevo = dir();
    writeLegacy(viejo, store);
    saveStore(nuevo, store);

    const a = loadStore(viejo)!;
    const b = loadStore(nuevo)!;
    const consulta = a.records[0].vector;

    const orden = (s: typeof a): Array<[string, number]> => s.records
      .map((r) => [r.path, cosineDense(consulta as number[], r.vector as number[])] as [string, number])
      .sort((x, y) => y[1] - x[1]);

    const oa = orden(a);
    const ob = orden(b);
    expect(ob.map(([p]) => p)).toEqual(oa.map(([p]) => p));
    for (let i = 0; i < oa.length; i++) expect(ob[i][1]).toBe(oa[i][1]);
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
    const antes = loadStore(d)!;
    saveStore(d, antes);
    expect(existsSync(vectorsPath(d))).toBe(true);
    // And the catalogue stopped carrying the vectors: that is the whole point.
    const cat = JSON.parse(readFileSync(storePath(d), 'utf8'));
    expect(cat.records[0].vector).toBeUndefined();
    expect(cat.format).toBe(2);
    const despues = loadStore(d)!;
    for (let i = 0; i < 30; i++) {
      for (let j = 0; j < 384; j++) expect(despues.records[i].vector[j]).toBe(store.records[i].vector[j]);
    }
  });
});

describe('the catalogue on its own', () => {
  it('reads path and hash without touching the vectors', () => {
    const d = dir();
    const store = fakeStore(50);
    saveStore(d, store);
    // Deleting the vectors proves the meta read never opens them: on a large
    // vault that file is 76 MB nobody needs in order to answer "what changed?".
    rmSync(vectorsPath(d));
    const meta = loadStoreMeta(d)!;
    expect(meta.records).toHaveLength(50);
    expect(meta.dim).toBe(384);
    expect(meta.records[7].hash).toBe(store.records[7].hash);
  });
});

describe('a half-written store is refused, not half-read', () => {
  it('returns null when there are fewer vectors than records', () => {
    // Somebody wrote the catalogue and not the vectors — a crash between the
    // two renames, a copy that missed a file. Reading it anyway would give each
    // record a neighbour's vector and rank against it, silently.
    const d = dir();
    const store = fakeStore(40);
    saveStore(d, store);
    const bin = readFileSync(vectorsPath(d));
    writeFileSync(vectorsPath(d), bin.subarray(0, Math.floor(bin.length / 2)));
    expect(loadStore(d)).toBeNull();
  });

  it('returns null on a catalogue that is not a store', () => {
    const d = dir();
    writeFileSync(storePath(d), '{"nope":1}');
    expect(loadStore(d)).toBeNull();
    expect(loadStoreMeta(d)).toBeNull();
  });
});

describe('the size that started all this', () => {
  it('costs about five times less on disk than the JSON did', () => {
    // 8,236 bytes a note measured on a real vault, against 1,536 of vector plus
    // a short path and a hash. The wall this removes is at 65,185 notes, where
    // the JSON passes the longest string V8 can make.
    const d = dir();
    const store = fakeStore(500);
    const viejo = dir();
    writeLegacy(viejo, store);
    saveStore(d, store);

    const antes = readFileSync(storePath(viejo)).length;
    const ahora = readFileSync(storePath(d)).length + readFileSync(vectorsPath(d)).length;
    expect(ahora).toBeLessThan(antes / 3);
    // And what still has to be read AS TEXT — the part with the string limit —
    // is now a small fraction of it.
    expect(readFileSync(storePath(d)).length).toBeLessThan(antes / 20);
  });
});
