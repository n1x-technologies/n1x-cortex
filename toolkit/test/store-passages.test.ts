// Passage vectors live in the same `vectors.bin` as the note vectors.
//
// That is the whole point of putting them there: the header and the exact size
// check that prove a catalogue and a binary belong together then cover the
// passages for free. A separate passages file would be a third thing that can
// arrive from a different save, which is exactly what this layout exists to
// make impossible.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadStore, loadStoreMeta, readStore, saveStore, passageMap, storePath, vectorsPath,
  type EmbeddingStore, type PassageRecord,
} from '../src/semantic/store.js';

const dir = (): string => mkdtempSync(join(tmpdir(), 'cortex-pass-'));

const DIM = 4;
const vec = (seed: number): number[] => Array.from({ length: DIM }, (_, i) => (seed + i) / 10);

const passage = (path: string, idx: number, over: Partial<PassageRecord> = {}): PassageRecord => ({
  path, idx, start: idx * 100, end: idx * 100 + 90, hash: `h${path}${idx}`, vector: vec(idx + 2), ...over,
});

const store = (passages: PassageRecord[] = []): EmbeddingStore => ({
  model: 'stub', dim: DIM,
  records: [
    { path: 'N/a.md', hash: 'ha', vector: vec(0) },
    { path: 'N/b.md', hash: 'hb', vector: vec(1) },
  ],
  ...(passages.length ? { passages } : {}),
});

const catalogue = (d: string) => JSON.parse(readFileSync(storePath(d), 'utf8'));

describe('a store with passages', () => {
  it('round-trips every passage, values and bounds included', () => {
    const d = dir();
    const ps = [passage('N/a.md', 0), passage('N/a.md', 1), passage('N/b.md', 0)];
    saveStore(d, store(ps));
    const back = loadStore(d)!;
    expect(back.passages).toHaveLength(3);
    back.passages!.forEach((p, i) => {
      expect(p.path).toBe(ps[i].path);
      expect(p.idx).toBe(ps[i].idx);
      expect(p.start).toBe(ps[i].start);
      expect(p.end).toBe(ps[i].end);
      expect(p.hash).toBe(ps[i].hash);
      // Float32 round-trip: the embedder already produced float32, so storing
      // the four bytes has to return the identical value.
      expect(Array.from(p.vector)).toEqual(Array.from(Float32Array.from(ps[i].vector)));
    });
  });

  it('the binary holds one vector per note and one per passage, and nothing else', () => {
    const d = dir();
    saveStore(d, store([passage('N/a.md', 0), passage('N/a.md', 1)]));
    // 16-byte header, then (2 notes + 2 passages) x DIM floats.
    expect(statSync(vectorsPath(d)).size).toBe(16 + (2 + 2) * DIM * 4);
  });

  it('note vectors are unchanged by passages sitting after them', () => {
    const d = dir();
    saveStore(d, store());
    const withoutPassages = loadStore(d)!.records.map(r => Array.from(r.vector));
    const e = dir();
    saveStore(e, store([passage('N/a.md', 0)]));
    expect(loadStore(e)!.records.map(r => Array.from(r.vector))).toEqual(withoutPassages);
  });

  it('only a store that has passages is marked as the format that holds them', () => {
    // A vault of short notes keeps being written in the format every earlier
    // version reads, so upgrading cortex costs nobody a re-embed.
    const plain = dir();
    saveStore(plain, store());
    expect(catalogue(plain).format).toBe(2);
    expect(catalogue(plain).passages).toBeUndefined();

    const rich = dir();
    saveStore(rich, store([passage('N/a.md', 0)]));
    expect(catalogue(rich).format).toBe(3);
  });

  it('the passage vectors are not in the catalogue', () => {
    // Same reason the note vectors left it: a vector written as decimal text
    // costs about eight kilobytes, and index.json has to stay readable as text.
    const d = dir();
    saveStore(d, store([passage('N/a.md', 0)]));
    expect(JSON.stringify(catalogue(d).passages)).not.toContain('vector');
  });

  it('a passage of the wrong dimension is refused before anything is written', () => {
    const d = dir();
    expect(() => saveStore(d, store([passage('N/a.md', 0, { vector: [1, 2] })])))
      .toThrow(/passage 0 of "N\/a.md" has 2 dimensions, expected 4/);
  });

  it('the size check covers the passages too', () => {
    // Drop the passage entries from the catalogue and the binary is now longer
    // than the catalogue accounts for. Before, the unaccounted tail would have
    // been ignored in silence.
    const d = dir();
    saveStore(d, store([passage('N/a.md', 0), passage('N/a.md', 1)]));
    const cat = catalogue(d);
    delete cat.passages;
    writeFileSync(storePath(d), JSON.stringify(cat));
    const r = readStore(d);
    expect(r.store).toBeNull();
    expect(r.problem).toMatch(/wrong size/);
  });

  it('a catalogue and a binary written in different formats are refused', () => {
    // One file finished writing and the other did not.
    const d = dir();
    saveStore(d, store([passage('N/a.md', 0)]));
    const bin = readFileSync(vectorsPath(d));
    bin.writeUInt32LE(2, 4);
    writeFileSync(vectorsPath(d), bin);
    expect(readStore(d).problem).toMatch(/not a cortex vectors file/);
  });

  it('reading the metadata reports the passages without reading a vector', () => {
    const d = dir();
    saveStore(d, store([passage('N/a.md', 0), passage('N/b.md', 0)]));
    const meta = loadStoreMeta(d)!;
    expect(meta.passages.map(p => `${p.path}#${p.idx}`)).toEqual(['N/a.md#0', 'N/b.md#0']);
    expect(JSON.stringify(meta)).not.toContain('vector');
  });

  it('a store written before passages existed still reads', () => {
    const d = dir();
    saveStore(d, store());
    const back = loadStore(d)!;
    expect(back.records).toHaveLength(2);
    expect(back.passages ?? []).toEqual([]);
  });

  it('a pre-binary catalogue carrying a passages key has it ignored, not half-trusted', () => {
    // Its vectors would have lived inside the JSON, and there is nowhere in that
    // layout for the reader to find them. Reporting the passages as present
    // while handing back no vectors would make `embed` reuse entries it cannot
    // load. One embed run rebuilds them.
    const d = dir();
    writeFileSync(storePath(d), JSON.stringify({
      model: 'stub', dim: DIM,
      records: [{ path: 'N/a.md', hash: 'ha', vector: vec(0) }],
      passages: [{ path: 'N/a.md', idx: 0, start: 0, end: 9, hash: 'x', vector: vec(2) }],
    }));
    const back = loadStore(d)!;
    expect(back.records).toHaveLength(1);
    expect(back.passages ?? []).toEqual([]);
    expect(loadStoreMeta(d)!.passages).toEqual([]);
  });
});

describe('passageMap', () => {
  it('groups by note and orders by passage index', () => {
    const s = store([passage('N/a.md', 2), passage('N/b.md', 0), passage('N/a.md', 0), passage('N/a.md', 1)]);
    const m = passageMap(s);
    expect(m.get('N/a.md')!.map(p => p.idx)).toEqual([0, 1, 2]);
    expect(m.get('N/b.md')!.map(p => p.idx)).toEqual([0]);
  });

  it('a store with no passages gives an empty map', () => {
    expect(passageMap(store()).size).toBe(0);
  });
});
