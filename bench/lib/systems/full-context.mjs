// The whole corpus in the prompt: the quality ceiling and the cost floor.
// With million-token context windows this is the honest competitor, not the
// strawman the old bench used it as.
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { walkVault } from '../corpus.mjs';

export const name = 'full-context';

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
