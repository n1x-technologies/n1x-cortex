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

    // A system declares `export const ranks = false` (e.g. full-context.mjs)
    // when its citedPaths are not actually a ranking — ordinal metrics would
    // then describe an accident of citedPaths' order, not retrieval quality.
    // Absent the flag, a system ranks by default (backward compatible with
    // every system that predates this flag).
    const ranksRetrieval = system.ranks !== false;

    for (const q of questions) {
      let r;
      try {
        r = await system.run(q.question, ctx);
      } catch (e) {
        errors.push({ id: q.id, message: e.message });
        continue;
      }
      if (ranksRetrieval) {
        recalls.push(recallAtK(r.citedPaths, q.goldPaths, 5));
        rrs.push(reciprocalRank(r.citedPaths, q.goldPaths, 10));
        ndcgs.push(ndcgAtK(r.citedPaths, q.goldPaths, 10));
      }
      tokens.push(countTokens(r.promptPayload) + r.retrievalTokens);
      latencies.push(r.latencyMs);
    }

    perSystem[system.name] = {
      name: system.name,
      // null means "not applicable" for a declared non-ranking system — it
      // must never be coerced to 0 downstream (same rule as Task 14's null
      // medianTokens): 0 would read as "measured zero relevance", which is
      // not what a non-ranking system's absence of a ranking means.
      recallAt5: ranksRetrieval ? round(mean(recalls)) : null,
      mrr: ranksRetrieval ? round(mean(rrs)) : null,
      ndcgAt10: ranksRetrieval ? round(mean(ndcgs)) : null,
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
