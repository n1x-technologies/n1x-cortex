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
import { selectSystemNames } from './lib/system-list.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// Walks argv one token at a time rather than in pairs. Stepping by two meant a
// valueless flag swallowed the NEXT flag as its value: `--gate --corpus
// fixtures` set `gate: '--corpus'` and left `corpus` unset, and plain `--gate`
// at the end of the line set it to `undefined`, which reads as "not passed" —
// so `node run.mjs --stage a --corpus fixtures --gate` printed a normal table
// and exited 0 with the regression gate never running. One dropped argument
// silently disabling CI's only guard is the failure mode this benchmark exists
// to avoid in its own metrics.
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument "${argv[i]}"`);
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = '1';   // valueless flag: present means on
    } else {
      args[key] = next;
      i++;
    }
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

const { stageA: stageANames, stageB: stageBNames } = selectSystemNames({
  stage,
  requested: args.systems ? args.systems.split(',') : undefined,
});

// Build the Stage B clients BEFORE Stage A runs, purely so a bad --model or a
// missing API key fails now rather than after the work.
//
// They used to be constructed inside the `stage === 'ab'` block below, so
// `--stage ab` with no ANTHROPIC_API_KEY did the whole of Stage A and then died
// on `Missing ANTHROPIC_API_KEY`. On the fixture that costs two seconds. On a
// real corpus Stage A downloads an embedding model and embeds the entire vault
// first — minutes of work thrown away over an unset environment variable, and
// the error arrives far enough from the cause to look unrelated.
//
// Constructing a client makes no network call; it only parses the spec and
// reads the key.
let llm, judgeLlm;
if (stage === 'ab') {
  if (!args.model) {
    console.error('Stage B needs --model provider:model (e.g. --model anthropic:claude-sonnet-5)');
    process.exit(1);
  }
  const { makeLlm } = await import('./lib/llm.mjs');
  llm = makeLlm(args.model, args['base-url']);
  judgeLlm = makeLlm(args['judge-model'] || args.model, args['base-url']);
}
const stageASystems = await Promise.all(
  stageANames.map(n => import(`./lib/systems/${n}.mjs`)),
);

const { loadCorpusText } = await import('./lib/systems/full-context.mjs');
const corpusText = loadCorpusText(vaultDir);

const results = await runStageA({ systems: stageASystems, questions, ctx: { vaultDir, embedder, corpusText } });

const outDir = resolve(args.out ? resolve(args.out) : join(here, 'out'));
mkdirSync(outDir, { recursive: true });
const payload = {
  stage: 'a',
  corpus: usingFixtures ? 'fixtures' : vaultDir,
  ...results,
};
writeFileSync(join(outDir, 'results.json'), JSON.stringify(payload, null, 2));

for (const s of Object.values(results.perSystem)) {
  // A system that declares itself non-ranking (full-context.mjs's `ranks =
  // false`) reports null recall@5/MRR/nDCG@10 from runStageA — printed as
  // "n/a", never coerced to a number, same treatment as null medianTokens.
  const recall = s.recallAt5 === null ? 'n/a' : s.recallAt5.toFixed(3);
  const mrr = s.mrr === null ? 'n/a' : s.mrr.toFixed(3);
  const ndcg = s.ndcgAt10 === null ? 'n/a' : s.ndcgAt10.toFixed(3);
  const nearMiss = s.nearMissHitRateAt5 === null ? 'n/a' : s.nearMissHitRateAt5.toFixed(3);
  console.log(
    `${s.name.padEnd(18)} recall@5 ${recall.padStart(5)}  ` +
    `MRR ${mrr.padStart(5)}  nDCG@10 ${ndcg.padStart(5)}  ` +
    `near-miss ${nearMiss.padStart(5)}  ` +
    `n ${s.scoredRanking}/${s.scoredNearMiss}/${s.scoredCost}  ` +
    `tok(med) ${String(s.medianTokens).padStart(6)}  ` +
    `lat(med) ${String(s.medianLatencyMs).padStart(5)}ms` +
    (s.errors.length ? `  [${s.errors.length} errors]` : ''),
  );
}
if (results.perSystem['full-context']?.recallAt5 === null) {
  console.log(
    "\nfull-context: recall@5/MRR/nDCG@10 are n/a — its citedPaths are the whole\n" +
    'corpus in filesystem order, not a ranking, so ordinal retrieval metrics would\n' +
    'describe directory order rather than retrieval quality. Its token cost is\n' +
    'still measured — that IS the point of including it: the reference cost a\n' +
    'retriever must beat.',
  );
}
if (Object.values(results.perSystem).some(s => s.scoredNearMiss > 0)) {
  console.log(
    '\nnear-miss: on trap questions the corpus cannot answer, the fraction of traps\n' +
    'where the system retrieved at least one tempting-but-insufficient note. Binary\n' +
    'per trap — retrieving one near-miss note counts the same as retrieving all of\n' +
    "them, because the question is only whether the system was tempted. Read it next\n" +
    "to Stage B's invented column: low invention with a low near-miss hit rate means\n" +
    'the system was never tempted, not that it resisted.',
  );
}
console.log(`\n${results.questionCount} questions · wrote ${join(outDir, 'results.json')}`);

if (stage === 'ab') {
  const { runStageB } = await import('./lib/stage-b.mjs');
  const { renderSpotCheck } = await import('./lib/spot-check.mjs');

  // llm and judgeLlm were built before Stage A — see the note up there.
  const stageBSystems = await Promise.all(
    stageBNames.map(n => import(`./lib/systems/${n}.mjs`)),
  );

  // full-context sends the entire corpus per question, so on a real corpus it
  // dominates the run's cost. It answers a subsample; the size is recorded in
  // the output and MUST be stated wherever its number is published.
  //
  // The cap applies to ANSWERABLE questions only — traps are always asked in
  // full, or full-context drops out of the invention comparison entirely. See
  // runStageB's subsample docstring. The default is the answerable count, i.e.
  // no cap.
  const answerableCount = questions.filter(q => q.answerable !== false).length;
  const fullContextSample = Number(args['full-context-sample'] ?? answerableCount);

  const b = await runStageB({
    systems: stageBSystems,
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

  // Explicit, not accidental: sample cortex's records for the published
  // judge-human agreement figure, rather than whichever system happened to
  // land first in stageBNames' insertion order.
  //
  // It is not always present, though: `--systems grep-agent` is a legitimate
  // run. Dereferencing it unconditionally threw a TypeError AFTER every paid
  // model call had been made and results-stage-b.json written, so the operator
  // paid for the run and got a stack trace instead of the summary table. Fall
  // back to the first system that did run, and say so.
  const spotName = b.perSystem.cortex ? 'cortex' : Object.keys(b.perSystem)[0];
  writeFileSync(join(outDir, 'spot-check.md'), renderSpotCheck(b, questions, 30, spotName));
  if (spotName !== 'cortex') {
    console.log(`\nspot-check sampled ${spotName}: cortex was not part of this run.`);
  }

  // Denominator is the ANSWERABLE count, not questionCount. contaminatedIds is
  // computed over answerable records only — a trap has no corpus answer the
  // model could have known — so dividing by the full set deflated the reported
  // contamination rate by every trap added, with no change in actual
  // contamination.
  console.log(`\ncontaminated: ${b.contaminatedIds.length}/${b.answerableCount} answerable questions ` +
              `(answered correctly with no context)\n`);
  for (const s of Object.values(b.perSystem)) {
    // Every rate is printed beside the denominator it was computed over
    // (`n <scored>/<scoredUncontaminated>`): Stage A already averages only
    // over questions that succeeded, so a system that errors on its hardest
    // questions and is perfect on the rest would otherwise look BETTER than
    // an honest system that answered everything. medianTokens is printed as
    // "n/a", never coerced to 0, when the system errored on every question.
    const tok = s.medianTokens === null ? 'n/a' : String(s.medianTokens);
    // Every rate prints "n/a" on an empty population rather than 0.000. A
    // broken system that answered nothing must not publish the best possible
    // fabrication score.
    const r = v => (v === null ? '  n/a' : v.toFixed(3));
    console.log(
      `${s.name.padEnd(18)} acc ${r(s.accuracy)}  ` +
      `acc(clean) ${r(s.accuracyUncontaminated)}  ` +
      `abstain ${r(s.abstentionRate)}  ` +
      `invented ${r(s.inventionRate)}  ` +
      `fabricate ${r(s.fabricationRate)}  ` +
      `fabricate(clean) ${r(s.fabricationRateUncontaminated)}  ` +
      `n ${s.scored}/${s.scoredUncontaminated}/${s.trapScored}  ` +
      `tok(med) ${tok.padStart(7)}` +
      (s.errors.length ? `  [${s.errors.length} errors]` : ''),
    );
  }
  // A dropped question is invisible in every rate above — it leaves the
  // denominator entirely, so a run that lost half its questions prints
  // confident-looking numbers over whatever survived. The commonest cause is a
  // judge reply the parser could not read, and there is no reason to assume
  // those failures are spread evenly across verdicts: two separate parser bugs
  // on this branch dropped one verdict class far more than the other, moving
  // fabricationRate and inventionRate in the flattering direction both times.
  // So the drop rate is stated in words, not left as a bracketed count.
  const dropped = Object.values(b.perSystem)
    .map(s => ({ name: s.name, errors: s.errors.length, asked: s.asked }))
    .filter(s => s.errors > 0);
  if (dropped.length) {
    console.log('\nDROPPED QUESTIONS — read before using any number above:');
    for (const s of dropped) {
      const pct = ((s.errors / s.asked) * 100).toFixed(1);
      console.log(`  ${s.name}: ${s.errors}/${s.asked} (${pct}%) never reached a verdict`);
    }
    console.log(
      '  Every rate above is computed over what survived. If these are not evenly\n' +
      '  spread across verdicts — an unreadable judge reply usually is not — the\n' +
      '  rates are biased by an unknown amount and are not publishable. Check\n' +
      '  results-stage-b.json for the per-question error messages.',
    );
  }

  console.log(`\nwrote ${join(outDir, 'results-stage-b.json')} and ${join(outDir, 'spot-check.md')}`);
  console.log('Label spot-check.md by hand and publish judge-human agreement with the numbers.');
}

const baselinePath = resolve(here, 'fixtures/baseline.json');

if (args['update-baseline'] !== undefined) {
  // A run scoped with --systems only ever produces results for the systems
  // requested. Writing that partial results.perSystem straight to the
  // baseline would permanently narrow the gate to whichever systems were
  // asked for — silently dropping every other system from coverage with no
  // warning at gate time (FIX 2). Refuse rather than let that happen.
  if (args.systems) {
    console.error(
      '--update-baseline refuses to run with --systems: a partial run would narrow the ' +
        'gate to only the requested systems, silently dropping every other system from ' +
        'coverage. Re-baseline with the full default system list (no --systems flag).',
    );
    process.exit(1);
  }

  const next = { perSystem: {} };
  for (const [name, s] of Object.entries(results.perSystem)) {
    next.perSystem[name] = {
      recallAt5: s.recallAt5,
      nearMissHitRateAt5: s.nearMissHitRateAt5,
      medianTokens: s.medianTokens,
      // Recorded so the gate can tell a dataset change from a cost regression
      // — medianTokens moves with the question mix, not only with the system.
      questionMix: {
        ranking: s.scoredRanking,
        nearMiss: s.scoredNearMiss,
        cost: s.scoredCost,
      },
    };
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
  // Both halves of the cache: the question vectors AND the naive-rag chunk
  // passage vectors that live in the same file.
  const cacheFailures = usingFixtures
    ? checkCacheCompleteness(
        questions,
        resolve(here, 'fixtures/query-vectors.json'),
        (await import('./lib/systems/naive-rag.mjs')).buildChunks(vaultDir).map(c => c.text),
      )
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
