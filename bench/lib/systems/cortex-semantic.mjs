// Ablation: pure semantic ranking, no lexical anchors and no graph expansion.
// retrieve() always fuses lexical signal, so this bypasses it and ranks
// straight off semanticQueryRanking, which returns note ids in rank order.
import { loadConfig } from '../../../toolkit/dist/config.js';
import { scanVault, collectFrontmatterKeys } from '../../../toolkit/dist/vault.js';
import { semanticQueryRanking } from '../../../toolkit/dist/semantic/queryRank.js';
import { renderPayload } from './_payload.mjs';

export const name = 'cortex-semantic';

const MAX_HITS = 12; // matches retrieve()'s default maxHits so payloads stay comparable

export async function run(question, ctx) {
  const t0 = performance.now();

  const config = loadConfig(ctx.vaultDir, collectFrontmatterKeys(ctx.vaultDir));
  const notes = scanVault(ctx.vaultDir, config);
  const rankedIds = await semanticQueryRanking(ctx.vaultDir, config, notes, question, ctx.embedder);

  const byId = new Map(notes.map(n => [n.id, n]));
  const hits = rankedIds
    .slice(0, MAX_HITS)
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(n => ({ path: n.path, title: n.title, excerpt: '' }));

  const latencyMs = performance.now() - t0;

  return {
    promptPayload: renderPayload(hits, ctx.vaultDir),
    citedPaths: hits.map(h => h.path),
    latencyMs,
    retrievalTokens: 0,
  };
}
