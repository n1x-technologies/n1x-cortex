// Regenerates the fixture's committed embedding store AND the query-vector
// cache. Run manually when fixture notes or questions change; requires the
// optional @huggingface/transformers peer and a network fetch on first run.
// CI never runs this — it consumes the committed output.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(here, '../fixtures/ci-vault');
const CLI = resolve(here, '../../toolkit/dist/cli.js');

console.log('embedding fixture vault...');
execFileSync('node', [CLI, 'embed'], { cwd: VAULT, stdio: 'inherit' });

const { loadConfig } = await import(resolve(here, '../../toolkit/dist/config.js'));
const { collectFrontmatterKeys } = await import(resolve(here, '../../toolkit/dist/vault.js'));
const { createTransformersEmbedder } = await import(resolve(here, '../../toolkit/dist/semantic/embedder.js'));
const { queryText } = await import(resolve(here, '../../toolkit/dist/semantic/text.js'));

const config = loadConfig(VAULT, collectFrontmatterKeys(VAULT));
const embedder = await createTransformersEmbedder(config.embedModel, join(VAULT, '.cortex/models'));

const questions = readFileSync(resolve(here, '../fixtures/ci-questions.jsonl'), 'utf8')
  .split('\n').map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l).question);

const vectors = {};
for (const q of questions) {
  const [v] = await embedder.embed([queryText(q)]);
  vectors[q] = Array.from(v);
  console.log(`  ${q.slice(0, 50)}`);
}

// embedder.dim is a closure variable only assigned as a side effect inside
// embed(), so it reads 0 until at least one vector has been produced — build
// the cache object after the loop, not before.
const cache = { model: config.embedModel, dim: embedder.dim, vectors };

const { buildChunks } = await import('../lib/systems/naive-rag.mjs');
for (const c of buildChunks(VAULT)) {
  const key = `passage: ${c.text}`;
  const [v] = await embedder.embed([key]);
  cache.vectors[key] = Array.from(v);
}
console.log('cached chunk passage vectors');

// One entry per line, vectors kept compact.
//
// `JSON.stringify(cache)` wrote the whole file as a single line, so every
// regeneration produced a one-line whole-file diff — 31 vectors changing or
// one, it looked identical in review, and there was no way to attribute a
// semantic-ranking change to the edit that caused it. `JSON.stringify(cache,
// null, 2)` is the opposite failure: 384 floats each on their own line, ~12k
// lines of noise.
//
// This is the granularity that matters — one line per cached text, so adding
// or rewording a question shows up as exactly one added or changed line.
const entries = Object.entries(cache.vectors)
  .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
  .join(',\n');
const serialised =
  '{\n' +
  `  "model": ${JSON.stringify(cache.model)},\n` +
  `  "dim": ${cache.dim},\n` +
  '  "vectors": {\n' +
  entries +
  '\n  }\n}\n';

writeFileSync(resolve(here, '../fixtures/query-vectors.json'), serialised);
console.log(`wrote ${questions.length} query vectors`);
