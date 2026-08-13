import { resolve } from 'node:path';
import { loadStore, storeMap, hashContent } from './store.js';
import { noteText, queryText } from './text.js';
import { cosineDense } from './cosine.js';
import { createTransformersEmbedder, createRemoteEmbedder, embedStoreId, type Embedder } from './embedder.js';
import type { Note, CortexConfig } from '../types.js';

export async function semanticQueryRanking(
  vaultDir: string,
  config: CortexConfig,
  notes: Note[],
  question: string,
  embedder?: Embedder,
): Promise<string[]> {
  const store = loadStore(resolve(vaultDir, config.embedDir));
  // Compared against the store's OWN identity, not the configured local model.
  // A store built through `--base-url` records a remote id, which never equals
  // config.embedModel — so this check used to reject every remote store and
  // drop silently back to lexical-only retrieval. The user saw no error, just
  // worse results, which is the failure mode this codebase keeps paying for.
  const expected = embedStoreId({
    model: store?.endpointModel ?? config.embedModel,
    baseUrl: store?.endpoint,
  });
  if (!store || store.model !== expected || !store.records.length) return [];

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
    // The question has to land in the SAME vector space as the stored notes,
    // so the backend follows the store rather than the config: embedding the
    // query locally against a remotely-built store would compare vectors from
    // two different spaces and quietly rank by noise.
    const emb = embedder ?? (store.endpoint
      ? createRemoteEmbedder({
          baseUrl: store.endpoint,
          model: store.endpointModel ?? config.embedModel,
          apiKey: process.env.OPENAI_API_KEY,
        })
      : await createTransformersEmbedder(config.embedModel, resolve(vaultDir, '.cortex/models')));
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
