import { resolve } from 'node:path';
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { loadStore, saveStore, storeMap, hashContent, type EmbeddingStore, type EmbeddingRecord } from '../semantic/store.js';
import { noteText, passageText } from '../semantic/text.js';
import { createTransformersEmbedder, type Embedder } from '../semantic/embedder.js';
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

export async function runEmbed(
  vaultDir: string,
  opts: {
    force?: boolean;
    model?: string;
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

  const prev = loadStore(embedDir);
  const usable = !opts.force && prev && prev.model === model ? prev : null;
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
    } else {
      const factory = opts.embedderFactory ?? createTransformersEmbedder;
      try {
        embedder = await factory(model, resolve(vaultDir, '.cortex/models'));
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException)?.code;
        const message = cause instanceof Error ? cause.message : String(cause);
        if (code === 'ERR_MODULE_NOT_FOUND' || message.includes('@huggingface/transformers')) {
          throw new Error(
            'Semantic support is optional and not installed. Enable it with:  npm i -g @huggingface/transformers',
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

  const store: EmbeddingStore = { model, dim, records };
  saveStore(embedDir, store);
  return { model, added, changed, removed, reused, total: records.length, gitignoreUpdated };
}

export function formatEmbed(r: EmbedResult): string {
  const main = `Embedded with ${r.model}: +${r.added} new, ~${r.changed} changed, -${r.removed} removed, ${r.reused} reused (store: ${r.total} notes).`;
  return r.gitignoreUpdated ? `${main}\nAdded .cortex/ to .gitignore (generated cache — not committed).` : main;
}
