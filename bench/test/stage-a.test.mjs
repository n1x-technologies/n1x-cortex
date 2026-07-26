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
});
