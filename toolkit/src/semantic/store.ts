// Where a vault's vectors live.
//
// ── Why this is not one JSON file any more ─────────────────────────────────
//
// It was. Every vector for the whole vault sat in `index.json` and was read
// with `JSON.parse(readFileSync(file, 'utf8'))`. One record costs about 8,236
// bytes of JSON — a 384-dimension vector written out as decimal text, plus its
// path and hash. That gives a hard wall nobody put there on purpose:
//
//   10,000 notes ......      82 MB
//   50,000 notes ......     412 MB
//   65,185 notes ......     537 MB  <- V8 cannot make a longer string
//
// Past that, `readFileSync(file, 'utf8')` throws `Cannot create a string longer
// than 0x1fffffe8 characters`, and no flag raises it: it is the maximum length
// of a string in the engine. It does not get slow first — it stops opening.
//
// So the vectors move out of the text. `vectors.bin` is the raw Float32 data,
// back to back: 384 x 4 = 1,536 bytes per note against 8,236, five times less,
// and no parsing at all. `index.json` keeps only what has to be searched by
// name — the path and the content hash — which stays small enough to read as
// text: about 60 bytes a note, 3 MB at 50,000.
//
// ── The numbers are the same numbers ──────────────────────────────────────
//
// This changes storage, not arithmetic. The embedder produces Float32Array, so
// every value already IS a float32; the old format wrote each one as decimal
// text and read it back into a float64 that holds exactly that float32. Storing
// the four bytes instead round-trips the identical value, so every cosine — and
// therefore every ranking — is bit-for-bit what it was.
//
// ── Two files have to be proven to belong together ────────────────────────
//
// One file could only be whole or unparseable. Two can disagree: a copy or a
// sync that carried one and not the other, or a process that died between the
// two renames. Both used to load without a word — a missing `vectors.bin`
// handed every note an empty vector (and the next `embed` "reused" them and
// wrote zeros), and a `vectors.bin` from another save handed every note a
// neighbour's vector. Neither ever raised an error; search just got worse.
//
// So `vectors.bin` opens with a 16-byte header — a magic tag, the format, and a
// random generation id that `index.json` also records — and its size has to be
// exactly header + records x dim x 4. A pair that fails any of that is refused
// with the reason, never read in part: to a query it is a store that is not
// there, and `embed` re-embeds every note and says why.
//
// ── Reading an old vault ──────────────────────────────────────────────────
//
// A catalogue with no `format` is the previous layout, with the vectors inside
// the JSON. It is self-contained, so it is read as it always was, whatever
// sits beside it. The next save writes the new pair, so the migration happens
// by itself and costs one embed run.

import { createHash, randomBytes } from 'node:crypto';
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, openSync, readSync, fstatSync, closeSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * A vector comes back as a view over one shared buffer, not as its own array.
 * That is the point of the format: 50,000 notes are one 76 MB Float32Array plus
 * 50,000 small objects, instead of 50,000 arrays of 384 doubles. Callers index
 * it and read `.length`, which both shapes do.
 */
export type Vector = Float32Array | number[];

export interface EmbeddingRecord { path: string; hash: string; vector: Vector; }
export interface EmbeddingStore {
  /** Identity of the vector space — see embedStoreId(). Reuse turns on this. */
  model: string;
  dim: number;
  records: EmbeddingRecord[];
  /**
   * The endpoint the vectors came from, when they came from one. `model`
   * already encodes it for identity, but a query has to EMBED ITS QUESTION into
   * the same space to compare against these vectors, and it cannot rebuild a
   * URL from that label. Absent means the local on-device backend.
   */
  endpoint?: string;
  /** The wire model name to send to that endpoint, unmangled. */
  endpointModel?: string;
}

/** Path and hash, with no vectors read. See `loadStoreMeta`. */
export interface EmbeddingMeta { path: string; hash: string; }
export interface EmbeddingStoreMeta {
  model: string;
  dim: number;
  records: EmbeddingMeta[];
  endpoint?: string;
  endpointModel?: string;
}

/**
 * What reading a store found. `problem` is set only when there was something
 * to read and it could not be trusted; a directory with no store at all is
 * `{ store: null, problem: null }`.
 */
export interface StoreRead { store: EmbeddingStore | null; problem: string | null; }

/** Marks a directory as written by this layout. Bumped if the layout changes. */
const FORMAT = 2;

/** `vectors.bin` header: magic (4) + format, uint32 LE (4) + generation (8). */
const MAGIC = Buffer.from('CXVB', 'ascii');
const HEADER = 16;

export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The catalogue: model, dimension, and one path + hash per note. */
export function storePath(embedDir: string): string {
  return join(embedDir, 'index.json');
}

/** The vectors themselves: a header, then Float32 back to back in the catalogue's order. */
export function vectorsPath(embedDir: string): string {
  return join(embedDir, 'vectors.bin');
}

interface Catalogue {
  format?: number;
  model: string;
  dim?: number;
  /** Hex of the 8 generation bytes in the matching `vectors.bin` header. */
  generation?: string;
  records: Array<{ path: string; hash: string; vector?: number[] }>;
  // Carried through untouched. A query has to embed its question into the same
  // space, and it cannot rebuild the URL from the model label alone: losing
  // these turns a vault embedded through an endpoint into one nobody can ask.
  endpoint?: string;
  endpointModel?: string;
}

/** A dimension records can have: a positive integer. */
const isDimension = (dim: unknown): dim is number => typeof dim === 'number' && Number.isInteger(dim) && dim > 0;

type Checked<T> = { value: T; problem: null } | { value: null; problem: string };
const refuse = (problem: string): { value: null; problem: string } => ({ value: null, problem });

function readCatalogue(embedDir: string): Checked<Catalogue> | null {
  const file = storePath(embedDir);
  if (!existsSync(file)) return null;
  let s: Catalogue;
  try {
    s = JSON.parse(readFileSync(file, 'utf8')) as Catalogue;
  } catch {
    return refuse('index.json is not valid JSON');
  }
  if (!s || typeof s.model !== 'string' || !Array.isArray(s.records)) {
    return refuse('index.json is not a cortex embedding store');
  }
  if (s.format !== undefined && s.format !== FORMAT) {
    return refuse(`index.json is format ${JSON.stringify(s.format)}; this version of cortex reads format ${FORMAT}`);
  }
  return { value: s, problem: null };
}

/** The previous layout: every record carries its own vector, all the same length. */
function checkLegacy(cat: Catalogue): Checked<number> {
  const dim = cat.dim ?? cat.records[0]?.vector?.length ?? 0;
  if (cat.records.length > 0 && !isDimension(dim)) return refuse('index.json has no usable dimension');
  for (const r of cat.records) {
    if (!Array.isArray(r.vector)) return refuse(`index.json record "${r.path}" has no vector`);
    if (r.vector.length !== dim) {
      return refuse(`index.json record "${r.path}" has ${r.vector.length} dimensions, expected ${dim}`);
    }
  }
  return { value: dim, problem: null };
}

/**
 * Does this `vectors.bin` belong to this catalogue? Decided from the header and
 * the file size alone, so the same answer is available without reading the
 * vectors — `loadStoreMeta` must never vouch for a store `loadStore` rejects.
 */
function checkPair(cat: Catalogue, header: Buffer, size: number): Checked<number> {
  const dim = cat.dim;
  if (!(isDimension(dim) || (dim === 0 && cat.records.length === 0))) return refuse('index.json has no usable dimension');
  if (header.length < HEADER || !header.subarray(0, 4).equals(MAGIC) || header.readUInt32LE(4) !== FORMAT) {
    return refuse('vectors.bin is not a cortex vectors file');
  }
  if (header.subarray(8, HEADER).toString('hex') !== cat.generation) {
    return refuse('vectors.bin is from a different save than index.json');
  }
  const expected = HEADER + cat.records.length * dim * 4;
  if (size !== expected) return refuse(`vectors.bin is the wrong size: ${size} bytes, expected ${expected}`);
  return { value: dim, problem: null };
}

/** Header and size of `vectors.bin` without reading the rest; null if it cannot be read. */
function peekVectors(embedDir: string): { header: Buffer; size: number } | null {
  const file = vectorsPath(embedDir);
  if (!existsSync(file)) return null;
  let fd: number | undefined;
  try {
    fd = openSync(file, 'r');
    const header = Buffer.alloc(HEADER);
    const n = readSync(fd, header, 0, HEADER, 0);
    return { header: header.subarray(0, n), size: fstatSync(fd).size };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Model, dimension and one path + hash per note, without reading the vectors.
 *
 * This is what deciding *what to embed* actually needs: the answer is a hash
 * comparison, and the vectors of the notes that did not change are never looked
 * at. Reading them anyway is 76 MB of pointless I/O on a large vault. The pair
 * is still checked — header and size — because a catalogue whose vectors are
 * gone would otherwise report every note as up to date.
 */
export function loadStoreMeta(embedDir: string): EmbeddingStoreMeta | null {
  const read = readCatalogue(embedDir);
  if (!read || read.problem !== null) return null;
  const cat = read.value;
  let dim: number;
  if (cat.format === undefined) {
    const legacy = checkLegacy(cat);
    if (legacy.problem !== null) return null;
    dim = legacy.value;
  } else {
    const peek = peekVectors(embedDir);
    if (!peek) return null;
    const pair = checkPair(cat, peek.header, peek.size);
    if (pair.problem !== null) return null;
    dim = pair.value;
  }
  return {
    model: cat.model,
    dim,
    records: cat.records.map((r) => ({ path: r.path, hash: r.hash })),
    endpoint: cat.endpoint,
    endpointModel: cat.endpointModel,
  };
}

/** The store, or the reason it could not be trusted. */
export function readStore(embedDir: string): StoreRead {
  const read = readCatalogue(embedDir);
  if (!read) return { store: null, problem: null };
  if (read.problem !== null) return { store: null, problem: read.problem };
  const cat = read.value;
  const meta = { model: cat.model, endpoint: cat.endpoint, endpointModel: cat.endpointModel };

  // The previous layout is self-contained: its vectors are in the JSON, and a
  // vectors.bin beside it belongs to a migration that did not finish.
  if (cat.format === undefined) {
    const legacy = checkLegacy(cat);
    if (legacy.problem !== null) return { store: null, problem: legacy.problem };
    const records = cat.records.map((r) => ({ path: r.path, hash: r.hash, vector: r.vector as number[] }));
    return { store: { ...meta, dim: legacy.value, records }, problem: null };
  }

  const bin = vectorsPath(embedDir);
  if (!existsSync(bin)) return { store: null, problem: 'vectors.bin is missing' };
  let buf: Buffer;
  try {
    buf = readFileSync(bin);
  } catch {
    return { store: null, problem: 'vectors.bin could not be read' };
  }
  const pair = checkPair(cat, buf.subarray(0, HEADER), buf.byteLength);
  if (pair.problem !== null) return { store: null, problem: pair.problem };
  const dim = pair.value;

  // A view, not a copy, whenever the bytes are 4-aligned. `readFileSync` can
  // hand back a slice of a larger pooled buffer, so the byte offset matters.
  const start = buf.byteOffset + HEADER;
  const count = cat.records.length * dim;
  const all = start % 4 === 0
    ? new Float32Array(buf.buffer, start, count)
    : new Float32Array(buf.buffer.slice(start, start + count * 4));

  const records: EmbeddingRecord[] = cat.records.map((r, i) => ({
    path: r.path,
    hash: r.hash,
    vector: all.subarray(i * dim, (i + 1) * dim),
  }));
  return { store: { ...meta, dim, records }, problem: null };
}

/** The store, or null when there is none or it could not be trusted. */
export function loadStore(embedDir: string): EmbeddingStore | null {
  return readStore(embedDir).store;
}

export function saveStore(embedDir: string, store: EmbeddingStore): void {
  const dim = store.dim || store.records[0]?.vector.length || 0;
  // Refused up front, before anything is written: padding or cutting a vector
  // stores one no model ever produced, and ranks it as if one had. Records with
  // no dimension at all would be a store the reader refuses, written by an
  // embed that reported success.
  if (store.records.length > 0 && !isDimension(dim)) {
    throw new Error(`cannot save ${store.records.length} vectors with no dimension — the embedder returned empty vectors`);
  }
  for (const r of store.records) {
    if (r.vector.length !== dim) {
      throw new Error(`vector for "${r.path}" has ${r.vector.length} dimensions, expected ${dim}`);
    }
  }

  const generation = randomBytes(8);
  const out = Buffer.alloc(HEADER + store.records.length * dim * 4);
  MAGIC.copy(out, 0);
  out.writeUInt32LE(FORMAT, 4);
  generation.copy(out, 8);
  const flat = new Float32Array(out.buffer, out.byteOffset + HEADER, store.records.length * dim);
  store.records.forEach((r, i) => flat.set(r.vector, i * dim));

  const catalogue: Catalogue = {
    format: FORMAT,
    model: store.model,
    dim,
    generation: generation.toString('hex'),
    records: store.records.map((r) => ({ path: r.path, hash: r.hash })),
    endpoint: store.endpoint,
    endpointModel: store.endpointModel,
  };

  // Each file is written beside its target and renamed into place, so neither
  // is ever seen half-written. The two renames are still two steps; a process
  // that dies between them leaves a pair whose generations differ, which the
  // reader refuses rather than mixing.
  mkdirSync(embedDir, { recursive: true });
  const tmpBin = `${vectorsPath(embedDir)}.tmp`;
  const tmpCat = `${storePath(embedDir)}.tmp`;
  writeFileSync(tmpBin, out);
  writeFileSync(tmpCat, JSON.stringify(catalogue));
  renameSync(tmpBin, vectorsPath(embedDir));
  renameSync(tmpCat, storePath(embedDir));
}

export function storeMap(store: EmbeddingStore): Map<string, EmbeddingRecord> {
  const m = new Map<string, EmbeddingRecord>();
  for (const r of store.records) m.set(r.path, r);
  return m;
}
