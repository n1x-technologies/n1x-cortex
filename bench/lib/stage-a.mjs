// Stage A: everything measurable without an LLM — retrieval quality, prompt
// cost, latency. This is the CI gate, so it must stay deterministic and
// offline. One system failing one question never aborts the run; the failure
// is recorded and excluded from that system's scores.
import { countTokens } from './tokenizer.mjs';
import { recallAtK, hitAtK, reciprocalRank, ndcgAtK, percentile, mean } from './metrics.mjs';

export async function runStageA({ systems, questions, ctx }) {
  const perSystem = {};

  for (const system of systems) {
    const recalls = [], rrs = [], ndcgs = [], nearMissHits = [], tokens = [], latencies = [];
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
        // Same default as dataset.mjs's loader: a question that does not
        // declare itself a trap is answerable. Applying it here too is not
        // inferring membership — it is the one documented default, restated
        // so a question object built inline (every test fixture predating
        // traps) is not misread as a trap and fed an undefined nearMissPaths.
        if (q.answerable !== false) {
          recalls.push(recallAtK(r.citedPaths, q.goldPaths, 5));
          rrs.push(reciprocalRank(r.citedPaths, q.goldPaths, 10));
          ndcgs.push(ndcgAtK(r.citedPaths, q.goldPaths, 10));
        } else {
          // A trap has no gold document — the retriever is not wrong to return
          // the topically relevant notes, the fact simply is not in any of
          // them. What IS measurable is whether the system was tempted at all:
          // a system that never retrieved a near-miss note and then declined
          // to answer looks identical to one that resisted temptation, and
          // only this number tells them apart.
          //
          // Binary, not fractional: "was it tempted" is a yes/no about the
          // question, so the aggregate is the fraction of traps on which the
          // system was tempted. Averaging per-trap coverage instead would
          // answer a question nobody asked and would move with the number of
          // near-miss paths an author happened to list. See hitAtK.
          //
          // loadDataset rejects a trap without nearMissPaths, but a question
          // object built inline (every test fixture, any future --questions
          // adapter) bypasses it, and an undefined here used to escape as a
          // bare TypeError from inside metrics.mjs — naming neither the
          // question nor the field. This is a malformed dataset rather than a
          // system failure, so it still stops the run; it just says why.
          if (!Array.isArray(q.nearMissPaths)) {
            throw new Error(
              `question "${q.id}" is declared a trap (answerable: false) but has no ` +
                'nearMissPaths array — a trap must name the notes that make it a near miss',
            );
          }
          nearMissHits.push(hitAtK(r.citedPaths, q.nearMissPaths, 5));
        }
      }
      tokens.push(countTokens(r.promptPayload) + r.retrievalTokens);
      latencies.push(r.latencyMs);
    }

    perSystem[system.name] = {
      name: system.name,
      // null means "not applicable", and it covers TWO distinct absences: the
      // system declared it does not rank, or the dataset contained no question
      // of that kind (no traps, or no answerable questions). Neither may be
      // coerced to 0 downstream — 0 reads as "measured zero relevance", and a
      // trap-free dataset publishing "0" for the near-miss hit rate would read
      // as a result rather than as an absence of data.
      recallAt5: ranksRetrieval && recalls.length ? round(mean(recalls)) : null,
      mrr: ranksRetrieval && rrs.length ? round(mean(rrs)) : null,
      ndcgAt10: ranksRetrieval && ndcgs.length ? round(mean(ndcgs)) : null,
      nearMissHitRateAt5: ranksRetrieval && nearMissHits.length ? round(mean(nearMissHits)) : null,
      medianTokens: Math.round(percentile(tokens, 0.5)),
      p95Tokens: Math.round(percentile(tokens, 0.95)),
      medianLatencyMs: Math.round(percentile(latencies, 0.5)),
      p95LatencyMs: Math.round(percentile(latencies, 0.95)),
      // Every rate is published next to its n. Three separate denominators,
      // because the three metric families are computed over three different
      // subsets of the run.
      scoredRanking: recalls.length,
      scoredNearMiss: nearMissHits.length,
      scoredCost: tokens.length,
      errors,
    };
  }

  return { perSystem, questionCount: questions.length };
}

const round = n => Math.round(n * 10000) / 10000;
