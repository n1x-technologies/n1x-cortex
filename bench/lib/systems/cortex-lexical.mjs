// Ablation: lexical anchors + graph expansion only, no semantic ranking.
// Isolates what the embedding layer contributes on top of the graph.
import { runQuery } from '../../../toolkit/dist/commands/query.js';
import { renderPayload } from './_payload.mjs';

export const name = 'cortex-lexical';

export async function run(question, ctx) {
  const t0 = performance.now();
  const result = runQuery(ctx.vaultDir, question);
  const latencyMs = performance.now() - t0;

  return {
    promptPayload: renderPayload(result.hits, ctx.vaultDir),
    citedPaths: result.hits.map(h => h.path),
    latencyMs,
    retrievalTokens: 0,
  };
}
