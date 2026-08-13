import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { loadStore, saveStore, storeMap, hashContent, type EmbeddingStore, type EmbeddingRecord } from '../semantic/store.js';
import { noteText, passageText } from '../semantic/text.js';
import { createTransformersEmbedder, createRemoteEmbedder, embedStoreId, type Embedder } from '../semantic/embedder.js';
import { ensureCortexIgnored } from '../gitignore.js';

export interface EmbedResult {
  model: string;
  added: number;
  changed: number;
  removed: number;
  reused: number;
  total: number;
  gitignoreUpdated: boolean;
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

  const prev = loadStore(embedDir);
  const usable = !opts.force && prev && prev.model === storeId ? prev : null;
  const prevMap = usable ? storeMap(usable) : new Map<string, EmbeddingRecord>();

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

  let dim = usable?.dim ?? 0;
  if (toEmbed.length) {
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
    const vectors = await embedder.embed(toEmbed.map(t => t.text));
    toEmbed.forEach((t, i) => {
      const vec = Array.from(vectors[i]);
      if (vec.length) dim = vec.length;
      records.push({ path: t.path, hash: t.hash, vector: vec });
    });
  }

  const livePaths = new Set(notes.map(n => n.path));
  const removed = usable ? usable.records.filter(r => !livePaths.has(r.path)).length : 0;

  const store: EmbeddingStore = {
    model: storeId,
    dim,
    records,
    ...(opts.baseUrl ? { endpoint: opts.baseUrl, endpointModel: model } : {}),
  };
  saveStore(embedDir, store);
  return { model: storeId, added, changed, removed, reused, total: records.length, gitignoreUpdated };
}

export function formatEmbed(r: EmbedResult): string {
  const main = `Embedded with ${r.model}: +${r.added} new, ~${r.changed} changed, -${r.removed} removed, ${r.reused} reused (store: ${r.total} notes).`;
  return r.gitignoreUpdated ? `${main}\nAdded .cortex/ to .gitignore (generated cache — not committed).` : main;
}
