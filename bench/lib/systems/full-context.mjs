// The whole corpus in the prompt: the quality ceiling and the cost ceiling —
// "floor" reads as "cheapest", which this system is not (a retriever that
// fetches less than the whole corpus costs less; two of them cost MORE than
// this on the CI fixture, but that is the fixture saturating, not a general
// claim). With million-token context windows this is the honest competitor,
// not the strawman the old bench used it as.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walkVault } from '../corpus.mjs';

export const name = 'full-context';

// This system emits the ENTIRE corpus, in walkVault's directory-enumeration
// order — not a ranking. recall@5/MRR/nDCG@10 truncate to the first k of
// citedPaths, so scoring them here would measure filesystem order, not
// retrieval competence (a real system that ranks its whole corpus by
// relevance would score very differently on the same fixture — see
// naive-rag.mjs's TOP_K note). Stage A reads this flag and reports those
// three metrics as null instead of a misleading number; token cost is still
// measured normally, since that IS the point of running full-context: it's
// the reference cost a retriever must beat, not a retrieval-quality contender.
export const ranks = false;

/** Every markdown note in the vault, labelled by path. Cache this — it is expensive. */
export function loadCorpusText(vaultDir) {
  return walkVault(vaultDir)
    .map(abs => `### ${relative(vaultDir, abs)}\n${readFileSync(abs, 'utf8')}`)
    .join('\n\n');
}

export function loadCorpusPaths(vaultDir) {
  return walkVault(vaultDir).map(abs => relative(vaultDir, abs));
}

export async function run(question, ctx) {
  const t0 = performance.now();
  const promptPayload = ctx.corpusText ?? loadCorpusText(ctx.vaultDir);
  const latencyMs = performance.now() - t0;

  return {
    promptPayload,
    citedPaths: loadCorpusPaths(ctx.vaultDir),
    latencyMs,
    retrievalTokens: 0,
  };
}
