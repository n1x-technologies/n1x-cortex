#!/usr/bin/env node
// Bench entrypoint.
//
//   node run.mjs --stage a --corpus fixtures
//   node run.mjs --stage a --corpus /path/to/vault --questions /path/to/q.jsonl
//
// Stage A needs no API keys and no network. Stage B is added in Phase 2.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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
if (stage !== 'a' && stage !== 'ab') {
  console.error(`--stage must be "a" or "ab", got "${stage}"`);
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

const SYSTEM_MODULES = stage === 'ab'
  ? ['cortex', 'cortex-lexical', 'cortex-semantic', 'naive-rag', 'full-context', 'grep-agent', 'closed-book']
  : ['cortex', 'cortex-lexical', 'cortex-semantic', 'naive-rag', 'full-context'];
const requested = args.systems ? args.systems.split(',') : SYSTEM_MODULES;
const systems = await Promise.all(
  requested.map(n => import(`./lib/systems/${n}.mjs`)),
);

const { loadCorpusText } = await import('./lib/systems/full-context.mjs');
const corpusText = loadCorpusText(vaultDir);

const results = await runStageA({ systems, questions, ctx: { vaultDir, embedder, corpusText } });

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

if (stage === 'ab') {
  const { makeLlm } = await import('./lib/llm.mjs');
  const { runStageB } = await import('./lib/stage-b.mjs');
  const { renderSpotCheck } = await import('./lib/spot-check.mjs');

  if (!args.model) {
    console.error('Stage B needs --model provider:model (e.g. --model anthropic:claude-sonnet-5)');
    process.exit(1);
  }

  const llm = makeLlm(args.model, args['base-url']);
  const judgeLlm = makeLlm(args['judge-model'] || args.model, args['base-url']);

  // full-context sends the entire corpus per question, so on a real corpus it
  // dominates the run's cost. It answers a subsample; the size is recorded in
  // the output and MUST be stated wherever its number is published.
  const fullContextSample = Number(args['full-context-sample'] ?? questions.length);

  const b = await runStageB({
    systems,
    questions,
    ctx: { vaultDir, embedder, llm, corpusText },
    llm,
    judgeLlm,
    subsample: { 'full-context': fullContextSample },
  });

  writeFileSync(join(outDir, 'results-stage-b.json'), JSON.stringify({
    stage: 'b',
    corpus: usingFixtures ? 'fixtures' : vaultDir,
    answeringModel: args.model,
    judgeModel: args['judge-model'] || args.model,
    subsample: { 'full-context': fullContextSample },
    ...b,
  }, null, 2));

  writeFileSync(join(outDir, 'spot-check.md'), renderSpotCheck(b, questions, 30));

  console.log(`\ncontaminated: ${b.contaminatedIds.length}/${b.questionCount} questions ` +
              `(answered correctly with no context)\n`);
  for (const s of Object.values(b.perSystem)) {
    // Every rate is printed beside the denominator it was computed over
    // (`n <scored>/<scoredUncontaminated>`): Stage A already averages only
    // over questions that succeeded, so a system that errors on its hardest
    // questions and is perfect on the rest would otherwise look BETTER than
    // an honest system that answered everything. medianTokens is printed as
    // "n/a", never coerced to 0, when the system errored on every question.
    const tok = s.medianTokens === null ? 'n/a' : String(s.medianTokens);
    console.log(
      `${s.name.padEnd(18)} acc ${s.accuracy.toFixed(3)}  ` +
      `acc(clean) ${s.accuracyUncontaminated.toFixed(3)}  ` +
      `abstain ${s.abstentionRate.toFixed(3)}  ` +
      `fabricate ${s.fabricationRate.toFixed(3)}  ` +
      `fabricate(clean) ${s.fabricationRateUncontaminated.toFixed(3)}  ` +
      `n ${s.scored}/${s.scoredUncontaminated}  ` +
      `tok(med) ${tok.padStart(7)}` +
      (s.errors.length ? `  [${s.errors.length} errors]` : ''),
    );
  }
  console.log(`\nwrote ${join(outDir, 'results-stage-b.json')} and ${join(outDir, 'spot-check.md')}`);
  console.log('Label spot-check.md by hand and publish judge-human agreement with the numbers.');
}

const baselinePath = resolve(here, 'fixtures/baseline.json');

if (args['update-baseline'] !== undefined) {
  const next = { perSystem: {} };
  for (const [name, s] of Object.entries(results.perSystem)) {
    next.perSystem[name] = { recallAt5: s.recallAt5, medianTokens: s.medianTokens };
  }
  writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nbaseline updated: ${baselinePath}`);
  process.exit(0);
}

if (args.gate !== undefined) {
  const { checkGate, checkCacheCompleteness } = await import('./lib/gate.mjs');

  // Silent-degradation guard: if the query-vector cache is missing an entry,
  // Cortex's semanticQueryRanking swallows the embedder's throw and falls
  // back to lexical-only retrieval with no error and (on this fixture) no
  // recall drop either. Catch the stale cache directly, not its symptom.
  const cacheFailures = usingFixtures
    ? checkCacheCompleteness(questions, resolve(here, 'fixtures/query-vectors.json'))
    : [];

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const { failures } = checkGate(results, baseline);
  const allFailures = [...cacheFailures, ...failures];

  if (allFailures.length) {
    console.error('\nBENCH GATE FAILED');
    for (const f of allFailures) console.error(`  - ${f}`);
    console.error('\nIf this change is intentional, re-baseline explicitly:');
    console.error('  node bench/run.mjs --stage a --corpus fixtures --update-baseline 1');
    process.exit(1);
  }
  console.log('\nbench gate passed');
}
