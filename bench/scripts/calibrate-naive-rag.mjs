// Picks the TOP_K whose median payload lands within 10% of Cortex's median on
// the same corpus, so the two systems compete under an equal cost budget.
// Calibrated against `cortex` (the hybrid system), never `cortex-semantic` —
// the semantic ablation hits its own MAX_HITS cap and inflates its payload
// independently of relevance, which would hand naive-rag a bigger budget than
// the system it's actually being compared to.
// Run manually when the corpus changes; commit the resulting constant.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../lib/dataset.mjs';
import { createCachedEmbedder } from '../lib/fixture-embedder.mjs';
import { countTokens } from '../lib/tokenizer.mjs';
import { percentile } from '../lib/metrics.mjs';
import * as cortex from '../lib/systems/cortex.mjs';
import { buildChunks } from '../lib/systems/naive-rag.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = process.env.VAULT ? resolve(process.env.VAULT) : resolve(here, '../fixtures/ci-vault');
const QUESTIONS = process.env.QUESTIONS
  ? resolve(process.env.QUESTIONS)
  : resolve(here, '../fixtures/ci-questions.jsonl');

const questions = loadDataset(QUESTIONS, VAULT);
const embedder = createCachedEmbedder(resolve(here, '../fixtures/query-vectors.json'));
const ctx = { vaultDir: VAULT, embedder };

const cortexTokens = [];
for (const q of questions) {
  const r = await cortex.run(q.question, ctx);
  cortexTokens.push(countTokens(r.promptPayload));
}
const target = percentile(cortexTokens, 0.5);
console.log(`cortex median payload: ${Math.round(target)} tokens`);

const chunks = buildChunks(VAULT);
const medianChunkTokens = percentile(chunks.map(c => countTokens(c.text)), 0.5);
console.log(`median chunk: ${Math.round(medianChunkTokens)} tokens`);

const k = Math.max(1, Math.round(target / medianChunkTokens));
const projected = k * medianChunkTokens;
const drift = Math.abs(projected - target) / target;

console.log(`\nTOP_K = ${k}  (projected ${Math.round(projected)} tokens, ${(drift * 100).toFixed(1)}% from target)`);
if (drift > 0.10) {
  console.log('WARNING: no integer k lands within 10%. Record the actual drift in bench/README.md.');
}
console.log('Set TOP_K in bench/lib/systems/naive-rag.mjs to this value.');
