import { resolve } from 'node:path';
import { loadStore, storeMap, passageMap, hashContent, type Vector } from './store.js';
import { noteText, queryText } from './text.js';
import { cosineDense } from './cosine.js';
import { createTransformersEmbedder, createRemoteEmbedder, embedStoreId, type Embedder } from './embedder.js';
import type { Note, CortexConfig } from '../types.js';

/** Where in a note's body the passage that made it rank sits. */
export interface Window { start: number; end: number }

export interface SemanticRanking {
  /** Note ids, best first. */
  order: string[];
  /** Only for the notes that ranked on a passage rather than on the whole note. */
  windows: Map<string, Window>;
}

/**
 * Ranks notes against the question, and says which passage spoke for each.
 *
 * ── Why a note has more than one vector ───────────────────────────────────
 *
 * The note vector is the note read whole, which for a long document means its
 * first page: the model attends about 512 tokens and the rest never reaches it.
 * So a long note also offers one candidate per passage, and the note's score is
 * the BEST of them.
 *
 * Best, not average. Averaging a document's passages sinks the one that answers
 * underneath every one that does not — the same defect as a single vector, with
 * different arithmetic. A document is relevant because some part of it answers,
 * not because all of it does.
 *
 * ── Why the window is recorded ────────────────────────────────────────────
 *
 * So the citation can come from the part that made the note appear. It is a
 * hint, not a verdict: `retrieve` prefers a line that shares words with the
 * question and falls back to the window only when no line does. Measured, the
 * model scores every passage of a long document within about two hundredths of
 * the top one, and at that separation which passage "won" is close to arbitrary
 * — so forcing the citation inside the winning window made citations worse.
 */
export async function semanticRanking(
  vaultDir: string,
  config: CortexConfig,
  notes: Note[],
  question: string,
  embedder?: Embedder,
): Promise<SemanticRanking> {
  const empty: SemanticRanking = { order: [], windows: new Map() };
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
  if (!store || store.model !== expected || !store.records.length) return empty;

  const recMap = storeMap(store);
  const passMap = passageMap(store);
  // Candidates, all tagged with the note they speak for. A note's passages are
  // trusted on the same check as the note itself: they were written by the same
  // embed run, so a note whose hash still matches has passages that match too.
  const fresh: { id: string; vector: Vector; window?: Window }[] = [];
  for (const note of notes) {
    const rec = recMap.get(note.path);
    if (!rec || rec.hash !== hashContent(noteText(note))) continue; // missing or stale → skip
    fresh.push({ id: note.id, vector: rec.vector });
    for (const p of passMap.get(note.path) ?? []) {
      fresh.push({ id: note.id, vector: p.vector, window: { start: p.start, end: p.end } });
    }
  }
  if (!fresh.length) return empty;

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
    return empty; // model unavailable → degrade to lexical
  }

  const best = new Map<string, { score: number; window?: Window }>();
  for (const f of fresh) {
    const score = cosineDense(qvec, f.vector);
    const held = best.get(f.id);
    if (!held || score > held.score) best.set(f.id, { score, window: f.window });
  }

  const order = [...best.entries()].sort((a, b) => b[1].score - a[1].score).map(([id]) => id);
  const windows = new Map<string, Window>();
  for (const [id, won] of best) if (won.window) windows.set(id, won.window);
  return { order, windows };
}

/** The ranking alone, for callers that have nothing to do with a citation. */
export async function semanticQueryRanking(
  vaultDir: string,
  config: CortexConfig,
  notes: Note[],
  question: string,
  embedder?: Embedder,
): Promise<string[]> {
  return (await semanticRanking(vaultDir, config, notes, question, embedder)).order;
}
