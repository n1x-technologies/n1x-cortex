import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface EmbeddingRecord { path: string; hash: string; vector: number[]; }
export interface EmbeddingStore { model: string; dim: number; records: EmbeddingRecord[]; }

export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function storePath(embedDir: string): string {
  return join(embedDir, 'index.json');
}

export function loadStore(embedDir: string): EmbeddingStore | null {
  const file = storePath(embedDir);
  if (!existsSync(file)) return null;
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as EmbeddingStore;
    if (!s || typeof s.model !== 'string' || !Array.isArray(s.records)) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveStore(embedDir: string, store: EmbeddingStore): void {
  mkdirSync(embedDir, { recursive: true });
  writeFileSync(storePath(embedDir), JSON.stringify(store));
}

export function storeMap(store: EmbeddingStore): Map<string, EmbeddingRecord> {
  const m = new Map<string, EmbeddingRecord>();
  for (const r of store.records) m.set(r.path, r);
  return m;
}
