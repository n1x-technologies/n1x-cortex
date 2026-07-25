// Stage A: everything measurable without an LLM — retrieval quality, prompt
// cost, latency. This is the CI gate, so it must stay deterministic and
// offline. One system failing one question never aborts the run; the failure
// is recorded and excluded from that system's scores.
import { countTokens } from './tokenizer.mjs';
import { recallAtK, reciprocalRank, ndcgAtK, percentile, mean } from './metrics.mjs';

export async function runStageA({ systems, questions, ctx }) {
  const perSystem = {};

  for (const system of systems) {
    const recalls = [], rrs = [], ndcgs = [], tokens = [], latencies = [];
    const errors = [];

    for (const q of questions) {
      let r;
      try {
        r = await system.run(q.question, ctx);
      } catch (e) {
        errors.push({ id: q.id, message: e.message });
        continue;
      }
      recalls.push(recallAtK(r.citedPaths, q.goldPaths, 5));
      rrs.push(reciprocalRank(r.citedPaths, q.goldPaths, 10));
      ndcgs.push(ndcgAtK(r.citedPaths, q.goldPaths, 10));
      tokens.push(countTokens(r.promptPayload) + r.retrievalTokens);
      latencies.push(r.latencyMs);
    }

    perSystem[system.name] = {
      name: system.name,
      recallAt5: round(mean(recalls)),
      mrr: round(mean(rrs)),
      ndcgAt10: round(mean(ndcgs)),
      medianTokens: Math.round(percentile(tokens, 0.5)),
      p95Tokens: Math.round(percentile(tokens, 0.95)),
      medianLatencyMs: Math.round(percentile(latencies, 0.5)),
      p95LatencyMs: Math.round(percentile(latencies, 0.95)),
      errors,
    };
  }

  return { perSystem, questionCount: questions.length };
}

const round = n => Math.round(n * 10000) / 10000;
