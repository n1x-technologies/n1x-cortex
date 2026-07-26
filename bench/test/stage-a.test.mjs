import { describe, it, expect } from 'vitest';
import { runStageA } from '../lib/stage-a.mjs';

const questions = [
  { id: 'q1', question: 'Q1', goldPaths: ['a.md'], goldAnswer: 'A', sourceUrl: null },
  { id: 'q2', question: 'Q2', goldPaths: ['b.md'], goldAnswer: 'B', sourceUrl: null },
];

const perfect = {
  name: 'perfect',
  async run(q) {
    const path = q === 'Q1' ? 'a.md' : 'b.md';
    return { promptPayload: 'hello world', citedPaths: [path], latencyMs: 5, retrievalTokens: 0 };
  },
};

const useless = {
  name: 'useless',
  async run() {
    return { promptPayload: '', citedPaths: ['z.md'], latencyMs: 1, retrievalTokens: 0 };
  },
};

const flaky = {
  name: 'flaky',
  async run(q) {
    if (q === 'Q1') throw new Error('boom');
    return { promptPayload: 'x', citedPaths: ['b.md'], latencyMs: 2, retrievalTokens: 0 };
  },
};

// Resolution 2 (task 13): grep-agent is the first system with a nonzero
// retrievalTokens — the token cost of its ReAct loop, spent BEFORE any
// answering call. stage-a's cost sum must include it, not just the
// promptPayload. 'agent' is 1 token under the real tokenizer (verified with
// countTokens), so with retrievalTokens: 500 the reported medianTokens must
// be exactly 501 — payload tokens PLUS retrieval tokens, not payload alone.
const agentLike = {
  name: 'agentLike',
  async run() {
    return { promptPayload: 'agent', citedPaths: ['a.md'], latencyMs: 3, retrievalTokens: 500 };
  },
};

// Resolution (task 15 review, Finding 2): a system that declares
// `ranks: false` emits citedPaths that are not actually a ranking (e.g.
// full-context.mjs's whole-corpus-in-directory-order payload). Ordinal
// retrieval metrics computed on it would describe filesystem order, not
// retrieval quality, so runStageA must report them as null while still
// computing real cost/latency metrics.
const nonRanking = {
  name: 'nonRanking',
  ranks: false,
  async run() {
    return { promptPayload: 'the whole corpus, unranked', citedPaths: ['a.md', 'b.md'], latencyMs: 4, retrievalTokens: 0 };
  },
};

describe('runStageA', () => {
  it('reports null ranking metrics but real token/latency metrics for a system declaring ranks: false', async () => {
    const r = await runStageA({ systems: [nonRanking], questions, ctx: {} });
    const s = r.perSystem.nonRanking;
    expect(s.recallAt5).toBeNull();
    expect(s.mrr).toBeNull();
    expect(s.ndcgAt10).toBeNull();
    expect(s.medianTokens).toBeGreaterThan(0);
    expect(s.medianLatencyMs).toBe(4);
    expect(s.errors).toEqual([]);
  });

  it('still ranks a system with no `ranks` property at all (backward compatible default)', async () => {
    const r = await runStageA({ systems: [perfect], questions, ctx: {} });
    expect(r.perSystem.perfect.recallAt5).toBe(1);
  });

  it('sums retrievalTokens into the reported cost, not just the promptPayload', async () => {
    const r = await runStageA({ systems: [agentLike], questions, ctx: {} });
    expect(r.perSystem.agentLike.medianTokens).toBe(501);
  });

  it('scores a perfect system at 1 across retrieval metrics', async () => {
    const r = await runStageA({ systems: [perfect], questions, ctx: {} });
    const s = r.perSystem.perfect;
    expect(s.recallAt5).toBe(1);
    expect(s.mrr).toBe(1);
    expect(s.ndcgAt10).toBeCloseTo(1, 10);
    expect(s.errors).toEqual([]);
  });

  it('counts tokens with the real tokenizer, not chars/4', async () => {
    const r = await runStageA({ systems: [perfect], questions, ctx: {} });
    expect(r.perSystem.perfect.medianTokens).toBeGreaterThan(0);
  });

  it('scores an empty-payload system at 0 recall — reduction alone is not a win', async () => {
    const r = await runStageA({ systems: [useless], questions, ctx: {} });
    expect(r.perSystem.useless.recallAt5).toBe(0);
    expect(r.perSystem.useless.medianTokens).toBe(0);
  });

  it('records a per-question error without aborting the run', async () => {
    const r = await runStageA({ systems: [flaky], questions, ctx: {} });
    expect(r.perSystem.flaky.errors).toHaveLength(1);
    expect(r.perSystem.flaky.errors[0].id).toBe('q1');
    expect(r.perSystem.flaky.errors[0].message).toMatch(/boom/);
    // the surviving question still scored
    expect(r.perSystem.flaky.recallAt5).toBe(1);
  });

  it('runs several systems over the same questions', async () => {
    const r = await runStageA({ systems: [perfect, useless], questions, ctx: {} });
    expect(Object.keys(r.perSystem).sort()).toEqual(['perfect', 'useless']);
    expect(r.questionCount).toBe(2);
  });

  // A trap question is one the corpus does not answer (dataset.mjs's
  // `answerable: false`). It has no gold document, so ordinal retrieval
  // metrics have no defined value for it — but its token and latency cost is
  // real. nearMissHitRateAt5 measures whether the system retrieved the
  // tempting-but-insufficient notes at all, which is the only thing that
  // separates "resisted temptation" from "was never tempted".
  const answerableQ = (id, gold) => ({
    id, question: `Q${id}`, goldPaths: [gold], goldAnswer: 'A',
    sourceUrl: null, answerable: true, nearMissPaths: [],
  });
  const trapQ = (id, ...near) => ({
    id, question: `T${id}`, goldPaths: [], goldAnswer: null,
    sourceUrl: null, answerable: false, nearMissPaths: near,
  });
  // Cites exactly what it is told to, for every question.
  const citing = (name, citedPaths) => ({
    name,
    async run() {
      return { promptPayload: 'hello world', citedPaths, latencyMs: 5, retrievalTokens: 0 };
    },
  });

  it('excludes trap questions from ranking metrics but counts them for cost', async () => {
    // Cites the near-miss note on every question. On the answerable question
    // that is a miss (gold is a different note); on the trap it is a hit.
    const r = await runStageA({
      systems: [citing('s', ['b.md'])],
      questions: [answerableQ('a1', 'a.md'), trapQ('t1', 'b.md')],
      ctx: {},
    });
    const s = r.perSystem.s;
    expect(s.recallAt5).toBe(0);            // one answerable question, gold not cited
    expect(s.nearMissHitRateAt5).toBe(1);   // one trap, near-miss note cited
    expect(s.scoredRanking).toBe(1);
    expect(s.scoredNearMiss).toBe(1);
    expect(s.scoredCost).toBe(2);           // cost counts BOTH questions
  });

  // The metric is a hit rate, not recall: it answers "was the system tempted",
  // a yes/no about the question. Retrieving one of two near-miss notes is the
  // same temptation as retrieving both. Scoring it 0.5 would invent a ranking
  // where there is none, and would move the number when an author adds a third
  // near-miss path without anything about retrieval changing.
  it('scores a trap as tempted when ANY near-miss note is retrieved, not a fraction', async () => {
    const r = await runStageA({
      systems: [citing('s', ['b.md'])],
      questions: [trapQ('t1', 'b.md', 'c.md')],  // two near-miss notes, one retrieved
      ctx: {},
    });
    expect(r.perSystem.s.nearMissHitRateAt5).toBe(1);
  });

  it('does not move when a trap gains another near-miss note the system never retrieves', async () => {
    const one = await runStageA({
      systems: [citing('s', ['b.md'])], questions: [trapQ('t1', 'b.md')], ctx: {},
    });
    const three = await runStageA({
      systems: [citing('s', ['b.md'])], questions: [trapQ('t1', 'b.md', 'c.md', 'd.md')], ctx: {},
    });
    expect(three.perSystem.s.nearMissHitRateAt5).toBe(one.perSystem.s.nearMissHitRateAt5);
  });

  it('scores a trap as untempted when no near-miss note is retrieved', async () => {
    const r = await runStageA({
      systems: [citing('s', ['unrelated.md'])],
      questions: [trapQ('t1', 'b.md')],
      ctx: {},
    });
    expect(r.perSystem.s.nearMissHitRateAt5).toBe(0);
    expect(r.perSystem.s.scoredNearMiss).toBe(1);  // measured, and measured as zero
  });

  it('averages the hit rate over every trap, not just the first', async () => {
    const r = await runStageA({
      systems: [citing('s', ['b.md'])],
      questions: [
        trapQ('t1', 'b.md'),          // tempted
        trapQ('t2', 'far.md'),        // not tempted
        trapQ('t3', 'b.md'),          // tempted
        trapQ('t4', 'other.md'),      // not tempted
      ],
      ctx: {},
    });
    expect(r.perSystem.s.nearMissHitRateAt5).toBe(0.5);
    expect(r.perSystem.s.scoredNearMiss).toBe(4);
  });

  it('only counts a near-miss note retrieved within the top 5', async () => {
    // Six notes cited; the near-miss note sits at rank 6. The metric is @5, so
    // the system was not tempted by anything a reader would have seen.
    const r = await runStageA({
      systems: [citing('s', ['1.md', '2.md', '3.md', '4.md', '5.md', 'near.md'])],
      questions: [trapQ('t1', 'near.md')],
      ctx: {},
    });
    expect(r.perSystem.s.nearMissHitRateAt5).toBe(0);
  });

  it('reports nearMissHitRateAt5 as null when the dataset has no traps', async () => {
    const r = await runStageA({
      systems: [citing('s', ['a.md'])], questions: [answerableQ('a1', 'a.md')], ctx: {},
    });
    expect(r.perSystem.s.nearMissHitRateAt5).toBeNull();
    expect(r.perSystem.s.scoredNearMiss).toBe(0);
  });

  it('reports every ranking metric as null for a declared non-ranking system, traps included', async () => {
    const sys = {
      name: 'nr',
      ranks: false,
      async run() {
        return { promptPayload: 'x', citedPaths: ['a.md', 'b.md'], latencyMs: 1, retrievalTokens: 0 };
      },
    };
    const r = await runStageA({
      systems: [sys],
      questions: [answerableQ('a1', 'a.md'), trapQ('t1', 'b.md')],
      ctx: {},
    });
    const s = r.perSystem.nr;
    expect(s.recallAt5).toBeNull();
    expect(s.nearMissHitRateAt5).toBeNull();
    expect(s.medianTokens).toBeGreaterThan(0); // cost is still measured
  });

  it('treats a question with no `answerable` field as answerable, like loadDataset does', async () => {
    // The pre-existing fixtures above omit the field entirely. Misreading them
    // as traps would call recallAtK with an undefined nearMissPaths and crash
    // the run, so the default is load-bearing rather than cosmetic.
    const r = await runStageA({ systems: [perfect], questions, ctx: {} });
    expect(r.perSystem.perfect.scoredRanking).toBe(2);
    expect(r.perSystem.perfect.scoredNearMiss).toBe(0);
  });
});
