#!/usr/bin/env node
// Bench entrypoint.
//
//   node run.mjs --stage a --corpus fixtures
//   node run.mjs --stage a --corpus /path/to/vault --questions /path/to/q.jsonl
//
// Stage A needs no API keys and no network. Stage B is added in Phase 2.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from './lib/dataset.mjs';
import { createCachedEmbedder } from './lib/fixture-embedder.mjs';
import { runStageA } from './lib/stage-a.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument "${argv[i]}"`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const stage = args.stage || 'a';
if (stage !== 'a') {
  console.error(`Stage "${stage}" is not available yet — Phase 2 adds Stage B.`);
  process.exit(1);
}

const usingFixtures = (args.corpus || 'fixtures') === 'fixtures';
const vaultDir = usingFixtures ? resolve(here, 'fixtures/ci-vault') : resolve(args.corpus);
const questionsPath = args.questions
  ? resolve(args.questions)
  : resolve(here, 'fixtures/ci-questions.jsonl');

const questions = loadDataset(questionsPath, vaultDir);

// The fixture corpus uses the committed query-vector cache so CI never
// downloads a model. A real corpus needs the real embedder: cortex.mjs would
// tolerate `undefined` (runQuerySemantic builds its own), but naive-rag.mjs
// calls ctx.embedder directly and would throw.
const embedder = usingFixtures
  ? createCachedEmbedder(resolve(here, 'fixtures/query-vectors.json'))
  : await (async () => {
      const { createTransformersEmbedder } = await import('../toolkit/dist/semantic/embedder.js');
      const { loadConfig } = await import('../toolkit/dist/config.js');
      const { collectFrontmatterKeys } = await import('../toolkit/dist/vault.js');
      const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
      return createTransformersEmbedder(config.embedModel, join(vaultDir, '.cortex/models'));
    })();

const SYSTEM_MODULES = ['cortex', 'cortex-lexical', 'cortex-semantic'];
const requested = args.systems ? args.systems.split(',') : SYSTEM_MODULES;
const systems = await Promise.all(
  requested.map(n => import(`./lib/systems/${n}.mjs`)),
);

const results = await runStageA({ systems, questions, ctx: { vaultDir, embedder } });

const outDir = resolve(args.out ? resolve(args.out) : join(here, 'out'));
mkdirSync(outDir, { recursive: true });
const payload = {
  stage: 'a',
  corpus: usingFixtures ? 'fixtures' : vaultDir,
  ...results,
};
writeFileSync(join(outDir, 'results.json'), JSON.stringify(payload, null, 2));

for (const s of Object.values(results.perSystem)) {
  console.log(
    `${s.name.padEnd(18)} recall@5 ${s.recallAt5.toFixed(3)}  ` +
    `MRR ${s.mrr.toFixed(3)}  nDCG@10 ${s.ndcgAt10.toFixed(3)}  ` +
    `tok(med) ${String(s.medianTokens).padStart(6)}  ` +
    `lat(med) ${String(s.medianLatencyMs).padStart(5)}ms` +
    (s.errors.length ? `  [${s.errors.length} errors]` : ''),
  );
}
console.log(`\n${results.questionCount} questions · wrote ${join(outDir, 'results.json')}`);
