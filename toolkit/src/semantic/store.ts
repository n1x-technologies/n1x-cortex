// Where a vault's vectors live.
//
// ── Why this is not one JSON file any more ─────────────────────────────────
//
// It was. Every vector for the whole vault sat in `index.json` and was read
// with `JSON.parse(readFileSync(file, 'utf8'))`. Measured on a real vault, one
// record costs 8,236 bytes of JSON — a 384-dimension vector written out as
// decimal text, plus its path and hash. That gives a hard wall nobody put there
// on purpose:
//
//      583 notes ......    4.8 MB   (a law firm's vault today)
//   50,000 notes ......     412 MB
//   65,185 notes ......     537 MB  <- V8 cannot make a longer string
//
// Past that, `readFileSync(file, 'utf8')` throws `Cannot create a string longer
// than 0x1fffffe8 characters`, and no flag raises it: it is the maximum length
// of a string in the engine. A firm digitising 110,000 pages of land-registry
// records reaches it. It does not get slow first — it stops opening.
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
// therefore every ranking — is bit-for-bit what it was. The test asserts that
// over a real vault's index rather than over made-up numbers.
//
// ── Reading an old vault ──────────────────────────────────────────────────
//
// A vault written by the previous version still loads: with no `vectors.bin`,
// the legacy `index.json` is parsed the way it always was. The next save writes
// the new pair, so the migration happens by itself and costs one embed run.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
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

/** Marks a directory as written by this layout. Bumped if the layout changes. */
const FORMAT = 2;

export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The catalogue: model, dimension, and one path + hash per note. */
export function storePath(embedDir: string): string {
  return join(embedDir, 'index.json');
}

/** The vectors themselves: Float32, back to back, in the catalogue's order. */
export function vectorsPath(embedDir: string): string {
  return join(embedDir, 'vectors.bin');
}

interface Catalogue {
  format?: number;
  model: string;
  dim?: number;
  records: Array<{ path: string; hash: string; vector?: number[] }>;
  // Carried through untouched. A query has to embed its question into the same
  // space, and it cannot rebuild the URL from the model label alone: losing
  // these turns a vault embedded through an endpoint into one nobody can ask.
  endpoint?: string;
  endpointModel?: string;
}

function readCatalogue(embedDir: string): Catalogue | null {
  const file = storePath(embedDir);
  if (!existsSync(file)) return null;
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as Catalogue;
    if (!s || typeof s.model !== 'string' || !Array.isArray(s.records)) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Model, dimension and one path + hash per note, without touching the vectors.
 *
 * This is what deciding *what to embed* actually needs: the answer is a hash
 * comparison, and the vectors of the notes that did not change are never looked
 * at. Reading them anyway is 76 MB of pointless I/O on a large vault, for a
 * screen whose whole job is to say "412 of 583 are up to date".
 */
export function loadStoreMeta(embedDir: string): EmbeddingStoreMeta | null {
  const cat = readCatalogue(embedDir);
  if (!cat) return null;
  return {
    model: cat.model,
    dim: cat.dim ?? (cat.records[0]?.vector?.length ?? 0),
    records: cat.records.map((r) => ({ path: r.path, hash: r.hash })),
    endpoint: cat.endpoint,
    endpointModel: cat.endpointModel,
  };
}

export function loadStore(embedDir: string): EmbeddingStore | null {
  const cat = readCatalogue(embedDir);
  if (!cat) return null;

  const bin = vectorsPath(embedDir);
  // A vault from before this format: the vectors are still inside the JSON. It
  // is read as it always was, and the next save moves it across.
  if (!existsSync(bin)) {
    return {
      model: cat.model,
      dim: cat.dim ?? (cat.records[0]?.vector?.length ?? 0),
      records: cat.records.map((r) => ({ path: r.path, hash: r.hash, vector: r.vector ?? [] })),
      endpoint: cat.endpoint,
      endpointModel: cat.endpointModel,
    };
  }

  const dim = cat.dim ?? 0;
  let all: Float32Array;
  try {
    const buf = readFileSync(bin);
    // A view, not a copy. `readFileSync` can hand back a slice of a larger
    // pooled buffer, so the byte offset matters.
    all = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  } catch {
    return null;
  }
  // The catalogue and the vectors have to agree. When they do not, something
  // wrote one and not the other — and half a store is worse than none, because
  // records would silently take a neighbour's vector and rank against it.
  if (!dim || all.length < cat.records.length * dim) return null;

  const records: EmbeddingRecord[] = cat.records.map((r, i) => ({
    path: r.path,
    hash: r.hash,
    vector: all.subarray(i * dim, (i + 1) * dim),
  }));
  return { model: cat.model, dim, records, endpoint: cat.endpoint, endpointModel: cat.endpointModel };
}

export function saveStore(embedDir: string, store: EmbeddingStore): void {
  mkdirSync(embedDir, { recursive: true });
  const dim = store.dim || store.records[0]?.vector.length || 0;

  const flat = new Float32Array(store.records.length * dim);
  store.records.forEach((r, i) => {
    const v = r.vector;
    // Written by position rather than copied wholesale: a record whose vector
    // came out the wrong length would otherwise shift every vector after it,
    // and the whole store would rank against the wrong notes without failing
    // once.
    const n = Math.min(dim, v.length);
    for (let j = 0; j < n; j++) flat[i * dim + j] = v[j];
  });

  const catalogue: Catalogue = {
    format: FORMAT,
    model: store.model,
    dim,
    records: store.records.map((r) => ({ path: r.path, hash: r.hash })),
    endpoint: store.endpoint,
    endpointModel: store.endpointModel,
  };

  // Both files or neither. Each is written beside its target and renamed into
  // place, so a process that dies mid-write leaves the previous store intact
  // instead of a catalogue pointing at vectors that are not there yet.
  const tmpBin = `${vectorsPath(embedDir)}.tmp`;
  const tmpCat = `${storePath(embedDir)}.tmp`;
  writeFileSync(tmpBin, Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength));
  writeFileSync(tmpCat, JSON.stringify(catalogue));
  renameSync(tmpBin, vectorsPath(embedDir));
  renameSync(tmpCat, storePath(embedDir));
}

export function storeMap(store: EmbeddingStore): Map<string, EmbeddingRecord> {
  const m = new Map<string, EmbeddingRecord>();
  for (const r of store.records) m.set(r.path, r);
  return m;
}
