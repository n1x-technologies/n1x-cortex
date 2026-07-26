// Cortex as shipped: hybrid lexical + semantic retrieval fused with RRF.
// Called in process, not through the CLI — process startup and embedding-model
// load would otherwise dominate the latency measurement.
import { runQuerySemantic } from '../../../toolkit/dist/commands/query.js';
import { renderPayload } from './_payload.mjs';

export const name = 'cortex';

export async function run(question, ctx) {
  const t0 = performance.now();
  const result = await runQuerySemantic(ctx.vaultDir, question, ctx.embedder);
  const latencyMs = performance.now() - t0;

  return {
    promptPayload: renderPayload(result.hits, ctx.vaultDir),
    citedPaths: result.hits.map(h => h.path),
    latencyMs,
    retrievalTokens: 0,
  };
}
