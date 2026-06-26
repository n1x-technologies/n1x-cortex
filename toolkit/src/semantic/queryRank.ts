import { resolve } from 'node:path';
import { loadStore, storeMap, hashContent } from './store.js';
import { noteText, queryText } from './text.js';
import { cosineDense } from './cosine.js';
import { createTransformersEmbedder, type Embedder } from './embedder.js';
import type { Note, CortexConfig } from '../types.js';

export async function semanticQueryRanking(
  vaultDir: string,
  config: CortexConfig,
  notes: Note[],
  question: string,
  embedder?: Embedder,
): Promise<string[]> {
  const store = loadStore(resolve(vaultDir, config.embedDir));
  if (!store || store.model !== config.embedModel || !store.records.length) return [];

  const recMap = storeMap(store);
  const fresh: { id: string; vector: number[] }[] = [];
  for (const note of notes) {
    const rec = recMap.get(note.path);
    if (!rec || rec.hash !== hashContent(noteText(note))) continue; // missing or stale → skip
    fresh.push({ id: note.id, vector: rec.vector });
  }
  if (!fresh.length) return [];

  let qvec: number[];
  try {
    const emb = embedder ?? await createTransformersEmbedder(config.embedModel, resolve(vaultDir, '.cortex/models'));
    const [v] = await emb.embed([queryText(question)]);
    qvec = Array.from(v);
  } catch {
    return []; // model unavailable → degrade to lexical
  }

  return fresh
    .map(f => ({ id: f.id, score: cosineDense(qvec, f.vector) }))
    .sort((a, b) => b.score - a.score)
    .map(f => f.id);
}
