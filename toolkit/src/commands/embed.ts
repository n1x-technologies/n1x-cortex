import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import {
  readStore, saveStore, storeMap, passageMap, hashContent,
  type EmbeddingStore, type EmbeddingRecord, type PassageRecord,
} from '../semantic/store.js';
import { noteText, passageText, chunkText } from '../semantic/text.js';
import { splitPassages } from '../semantic/passages.js';
import { createTransformersEmbedder, createRemoteEmbedder, embedStoreId, type Embedder } from '../semantic/embedder.js';
import { ensureCortexIgnored } from '../gitignore.js';

export interface EmbedResult {
  model: string;
  added: number;
  changed: number;
  removed: number;
  reused: number;
  total: number;
  /** Passage vectors in the store, and how many notes needed them. */
  passages: number;
  chunked: number;
  gitignoreUpdated: boolean;
  /** Why the existing store was not trusted, when it was not. Every note was re-embedded. */
  storeProblem?: string;
}

export const EMBED_USAGE =
  'Usage: cortex embed [--force] [--model <model>] [--base-url <url>]';

export interface EmbedArgs {
  force: boolean;
  model?: string;
  baseUrl?: string;
}

/**
 * Parses the argv tail of `cortex embed`.
 *
 * The old reader was `rest.includes('--force')` plus an `indexOf('--model')`,
 * so anything else on the line was ignored in silence — `cortex embed
 * --base-url http://…` dropped the flag, fell through to the local backend and
 * failed with "Semantic support is optional and not installed". The user was
 * told to install a package when what they had actually asked for did not
 * exist. Unknown options are rejected for that reason, not for tidiness.
 */
export function parseEmbedArgs(argv: string[]): EmbedArgs {
  const out: EmbedArgs = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    const value = (): string => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${tok} needs a value — ${EMBED_USAGE}`);
      i++;
      return v;
    };
    switch (tok) {
      case '--force': out.force = true; break;
      case '--model': out.model = value(); break;
      case '--base-url': out.baseUrl = value(); break;
      default: throw new Error(`unknown option "${tok}" — ${EMBED_USAGE}`);
    }
  }
  return out;
}

export async function runEmbed(
  vaultDir: string,
  opts: {
    force?: boolean;
    model?: string;
    /** An OpenAI-compatible endpoint. Absent means the local on-device store. */
    baseUrl?: string;
    apiKey?: string;
    embedder?: Embedder;
    embedderFactory?: (model: string, cacheDir: string) => Promise<Embedder>;
  } = {},
): Promise<EmbedResult> {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  // Embedding generates a heavy per-machine cache under .cortex/ — make sure
  // it's gitignored before we write any vectors.
  const gitignoreUpdated = ensureCortexIgnored(vaultDir);
  const notes = scanVault(vaultDir, config);
  const model = opts.model ?? config.embedModel;
  const embedDir = resolve(vaultDir, config.embedDir);

  // What the store records and decides reuse on. For a remote backend it
  // carries the endpoint, so pointing embed at a different server re-embeds
  // instead of quietly mixing vectors from two different spaces.
  const storeId = embedStoreId({ model, baseUrl: opts.baseUrl });

  // A store that cannot be trusted is not reused — its notes are re-embedded,
  // and the result says so instead of reporting them as "reused".
  const { store: prev, problem: storeProblem } = readStore(embedDir);
  const usable = !opts.force && prev && prev.model === storeId ? prev : null;
  const prevMap = usable ? storeMap(usable) : new Map<string, EmbeddingRecord>();
  const prevPassages = usable ? passageMap(usable) : new Map<string, PassageRecord[]>();

  const records: EmbeddingRecord[] = [];
  const toEmbed: { path: string; hash: string; text: string }[] = [];
  let reused = 0, changed = 0, added = 0;

  for (const note of notes) {
    const hash = hashContent(noteText(note));
    const prevRec = prevMap.get(note.path);
    if (prevRec && prevRec.hash === hash) {
      records.push(prevRec);
      reused++;
    } else {
      if (prevRec) changed++; else added++;
      toEmbed.push({ path: note.path, hash, text: passageText(note) });
    }
  }

  // Passages, for the notes that do not fit the model's window.
  //
  // The hash is of the passage text, not of the note, so editing the end of a
  // long document re-embeds the passage that changed rather than all of them.
  // The bounds are compared too: a passage whose text is unchanged but which now
  // starts somewhere else would cite from the wrong place.
  const passages: PassageRecord[] = [];
  const toEmbedPassages: { rec: Omit<PassageRecord, 'vector'>; text: string }[] = [];
  let chunked = 0;

  for (const note of notes) {
    const parts = splitPassages(note);
    // One passage means the note fits: its note vector already covers it, and
    // storing the same vector twice only makes the file bigger.
    if (parts.length < 2) continue;
    chunked++;
    const before = new Map((prevPassages.get(note.path) ?? []).map((r) => [r.idx, r]));
    for (const part of parts) {
      const hash = hashContent(part.text);
      const prevPart = before.get(part.idx);
      if (prevPart && prevPart.hash === hash && prevPart.start === part.start && prevPart.end === part.end) {
        passages.push(prevPart);
        continue;
      }
      toEmbedPassages.push({
        rec: { path: note.path, idx: part.idx, start: part.start, end: part.end, hash },
        text: chunkText(part.text),
      });
    }
  }

  let dim = usable?.dim ?? 0;
  if (toEmbed.length || toEmbedPassages.length) {
    let embedder: Embedder;
    if (opts.embedder) {
      embedder = opts.embedder;
    } else if (opts.baseUrl) {
      // No optional dependency, no model download, no onnxruntime.
      embedder = createRemoteEmbedder({ baseUrl: opts.baseUrl, model, apiKey: opts.apiKey });
    } else {
      const factory = opts.embedderFactory ?? createTransformersEmbedder;
      try {
        embedder = await factory(model, resolve(vaultDir, '.cortex/models'));
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException)?.code;
        const message = cause instanceof Error ? cause.message : String(cause);
        if (code === 'ERR_MODULE_NOT_FOUND' || message.includes('@huggingface/transformers')) {
          // The old text said only `npm i -g`, which is the wrong advice for
          // the common case: cortex consumed as a project dependency, where a
          // global install does not satisfy the import. It also offered no hint
          // that the local backend is now avoidable altogether.
          throw new Error(
            'Semantic support is optional and not installed.\n' +
              '  In this project:   npm i @huggingface/transformers\n' +
              '  For a global CLI:  npm i -g @huggingface/transformers\n' +
              '  Or skip it entirely and embed through a remote endpoint:\n' +
              '                     cortex embed --base-url <url> --model <model>',
            { cause },
          );
        }
        throw new Error(`could not download model "${model}" — check your network connection`, { cause });
      }
    }
    // Notes and passages go in one call. They are the same kind of work for the
    // embedder, and splitting them would pay the batch overhead twice — on a
    // remote backend, twice the round trips.
    const vectors = await embedder.embed([
      ...toEmbed.map(t => t.text),
      ...toEmbedPassages.map(t => t.text),
    ]);
    toEmbed.forEach((t, i) => {
      const vec = Array.from(vectors[i]);
      if (vec.length) dim = vec.length;
      records.push({ path: t.path, hash: t.hash, vector: vec });
    });
    toEmbedPassages.forEach((t, i) => {
      const vec = Array.from(vectors[toEmbed.length + i]);
      if (vec.length) dim = vec.length;
      passages.push({ ...t.rec, vector: vec });
    });
  }

  // Reused passages come out before the newly embedded ones. Sorting makes the
  // file the same for the same vault whichever notes happened to change.
  passages.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.idx - b.idx));

  const livePaths = new Set(notes.map(n => n.path));
  const removed = usable ? usable.records.filter(r => !livePaths.has(r.path)).length : 0;

  const store: EmbeddingStore = {
    model: storeId,
    dim,
    records,
    // Built from the notes that are on disk now, so a deleted note's passages
    // are simply never carried over and the file cannot grow forever.
    ...(passages.length ? { passages } : {}),
    ...(opts.baseUrl ? { endpoint: opts.baseUrl, endpointModel: model } : {}),
  };
  saveStore(embedDir, store);
  return {
    model: storeId, added, changed, removed, reused, total: records.length,
    passages: passages.length, chunked, gitignoreUpdated,
    ...(storeProblem ? { storeProblem } : {}),
  };
}

export function formatEmbed(r: EmbedResult): string {
  const lines = [`Embedded with ${r.model}: +${r.added} new, ~${r.changed} changed, -${r.removed} removed, ${r.reused} reused (store: ${r.total} notes).`];
  // Said only when it happened: on a vault of short notes this line would be a
  // zero that means nothing, and it is worth noticing that a vault has
  // documents too long for the model to read whole.
  if (r.chunked) lines.push(`${r.passages} passage vectors from ${r.chunked} note(s) too long to embed whole.`);
  if (r.storeProblem) lines.push(`The existing store was unreadable (${r.storeProblem}), so every note was re-embedded.`);
  if (r.gitignoreUpdated) lines.push('Added .cortex/ to .gitignore (generated cache — not committed).');
  return lines.join('\n');
}
