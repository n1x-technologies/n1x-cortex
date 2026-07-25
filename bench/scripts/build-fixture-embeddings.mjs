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

writeFileSync(resolve(here, '../fixtures/query-vectors.json'), JSON.stringify(cache));
console.log(`wrote ${questions.length} query vectors`);
