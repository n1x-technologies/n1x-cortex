import { describe, it, expect } from 'vitest';
import { runStageB } from '../lib/stage-b.mjs';

const questions = [
  { id: 'q1', question: 'Q1', goldPaths: ['a.md'], goldAnswer: 'ALPHA', sourceUrl: null },
  { id: 'q2', question: 'Q2', goldPaths: ['b.md'], goldAnswer: 'BETA', sourceUrl: null },
];

const sys = (label, payload) => ({
  name: label,
  async run() { return { promptPayload: payload, citedPaths: ['a.md'], latencyMs: 1, retrievalTokens: 0 }; },
});

// The answering model echoes the payload; the judge marks a candidate correct
// when it contains the gold answer.
//
// The judge now decides abstention too — it is no longer short-circuited by a
// local pattern before the call — so this stub has to model all three labels.
// It declines only when the candidate is a BARE refusal: a decline followed by
// a figure is graded on the figure, which is the behaviour the change exists
// to produce.
const llm = { async complete(_s, user) { return /Context:\n([\s\S]*?)\n\nQuestion/.exec(user)?.[1] ?? "I don't know."; } };
const judgeLlm = {
  async complete(_s, user) {
    const gold = /Gold answer: (.*)/.exec(user)[1];
    const cand = /Candidate answer: (.*)/.exec(user)[1];
    if (/^\s*(i don'?t know|unknown|the context does not contain[^.]*)\.?\s*$/i.test(cand)) {
      return 'ABSTAINED';
    }
    return cand.includes(gold) ? 'CORRECT' : 'INCORRECT';
  },
};

describe('runStageB', () => {
  it('scores a system whose payload contains both answers as fully correct', async () => {
    const r = await runStageB({
      systems: [sys('good', 'ALPHA BETA')], questions, ctx: {}, llm, judgeLlm,
    });
    expect(r.perSystem.good.accuracy).toBe(1);
    expect(r.perSystem.good.fabricationRate).toBe(0);
  });

  it('counts a wrong non-abstaining answer as fabrication', async () => {
    const r = await runStageB({
      systems: [sys('bad', 'GAMMA')], questions, ctx: {}, llm, judgeLlm,
    });
    expect(r.perSystem.bad.accuracy).toBe(0);
    expect(r.perSystem.bad.fabricationRate).toBe(1);
    expect(r.perSystem.bad.abstentionRate).toBe(0);
  });

  it('counts an abstention as neither correct nor fabricated', async () => {
    // FIX 1: an empty promptPayload is no longer a stand-in for "the system
    // abstained" — a non-closed-book system returning '' now throws (it's a
    // broken run, not an abstention). Exercise abstention directly: a system
    // with real context whose answering model replies "I don't know."
    const abstainingLlm = { async complete() { return "I don't know."; } };
    const r = await runStageB({
      systems: [sys('abstains', 'SOME CONTEXT')], questions, ctx: {}, llm: abstainingLlm, judgeLlm,
    });
    expect(r.perSystem.abstains.accuracy).toBe(0);
    expect(r.perSystem.abstains.abstentionRate).toBe(1);
    expect(r.perSystem.abstains.fabricationRate).toBe(0);
  });

  // The gameable system the prefix-anchored pattern could not see. It declines
  // and then answers anyway, every time. Under the old local short-circuit it
  // scored `abstain 1.000 / fabricate 0.000` — a perfect score on the metric
  // the grounding claim rests on, while fabricating on 100% of questions.
  it('does not let a decline-then-answer system publish a zero fabrication rate', async () => {
    const mixedGamer = { async complete() { return "I don't know. It is 42."; } };
    const r = await runStageB({
      systems: [sys('mixed-gamer', 'ALPHA BETA')], questions, ctx: {}, llm: mixedGamer, judgeLlm,
    });
    const s = r.perSystem['mixed-gamer'];
    expect(s.abstentionRate).toBe(0);
    expect(s.fabricationRate).toBe(1);
    expect(s.accuracy).toBe(0);
  });

  // Same short-circuit, second victim: closed-book is the contamination
  // control, and a decline-shaped prefix meant it was never graded `correct`,
  // so a question the model provably knew from pretraining counted as
  // uncontaminated and accuracyUncontaminated read over a polluted set.
  it('detects contamination even when the control hedges before answering', async () => {
    const hedgingControl = { async complete(_s, user) {
      return /Context:\n\n?\nQuestion/.test(user) || !/Context:/.test(user)
        ? "I don't know. ALPHA." : 'ALPHA';
    } };
    const closedBook = { name: 'closed-book', closedBook: true,
      async run() { return { promptPayload: '', citedPaths: [], latencyMs: 0, retrievalTokens: 0 }; } };
    const r = await runStageB({
      systems: [closedBook], questions: [questions[0]], ctx: {},
      llm: hedgingControl, judgeLlm,
    });
    expect(r.contaminatedIds).toEqual(['q1']);
  });

  it('marks questions the closed-book control answers correctly as contaminated', async () => {
    const closedBook = {
      name: 'closed-book',
      closedBook: true,
      async run() { return { promptPayload: '', citedPaths: [], latencyMs: 0, retrievalTokens: 0 }; },
    };
    // This answering model "already knows" q1 with no context.
    const knowing = {
      async complete(_s, user) {
        if (!/Context:/.test(user)) return /Q1/.test(user) ? 'ALPHA' : "I don't know.";
        return /Context:\n([\s\S]*?)\n\nQuestion/.exec(user)[1];
      },
    };
    const r = await runStageB({
      systems: [closedBook, sys('good', 'ALPHA BETA')], questions, ctx: {}, llm: knowing, judgeLlm,
    });
    expect(r.contaminatedIds).toEqual(['q1']);
    expect(r.uncontaminatedCount).toBe(1);
    // 'good' is right on both, so uncontaminated accuracy is still 1
    expect(r.perSystem.good.accuracyUncontaminated).toBe(1);
  });

  it('records a per-question error without aborting', async () => {
    const flaky = {
      name: 'flaky',
      async run(q) {
        if (q === 'Q1') throw new Error('boom');
        return { promptPayload: 'BETA', citedPaths: [], latencyMs: 1, retrievalTokens: 0 };
      },
    };
    const r = await runStageB({ systems: [flaky], questions, ctx: {}, llm, judgeLlm });
    expect(r.perSystem.flaky.errors).toHaveLength(1);
    expect(r.perSystem.flaky.accuracy).toBe(1); // the surviving question
  });

  it('keeps a per-question record for auditing', async () => {
    const r = await runStageB({ systems: [sys('good', 'ALPHA BETA')], questions, ctx: {}, llm, judgeLlm });
    expect(r.perSystem.good.records).toHaveLength(2);
    expect(r.perSystem.good.records[0]).toMatchObject({ id: 'q1', verdict: 'correct' });
    expect(typeof r.perSystem.good.records[0].candidate).toBe('string');
  });

  it('caps a subsampled system and records how many it was asked', async () => {
    const r = await runStageB({
      systems: [sys('full-context', 'ALPHA BETA'), sys('cortex', 'ALPHA BETA')],
      questions, ctx: {}, llm, judgeLlm,
      subsample: { 'full-context': 1 },
    });
    expect(r.perSystem['full-context'].asked).toBe(1);
    expect(r.perSystem['full-context'].records).toHaveLength(1);
    expect(r.perSystem.cortex.asked).toBe(2);
  });

  it('leaves systems alone when no subsample is given', async () => {
    const r = await runStageB({ systems: [sys('cortex', 'ALPHA BETA')], questions, ctx: {}, llm, judgeLlm });
    expect(r.perSystem.cortex.asked).toBe(2);
  });

  // Resolution 1: every test above uses two questions with a homogeneous
  // outcome, so every rate lands on exactly 0 or exactly 1 — rate() could be
  // `records.some(matches) ? 1 : 0` and the suite above would still pass. This
  // pins the actual division: three questions, three distinct verdicts, exact
  // fractional values under the module's 4-decimal round. If the fabrication
  // (or accuracy, or abstention) denominator is ever changed to exclude any of
  // these three records, this is the test that catches it.
  it('computes exact fractional rates over three questions with mixed outcomes', async () => {
    const mixed = [
      { id: 'm1', question: 'M1', goldPaths: ['a.md'], goldAnswer: 'ALPHA', sourceUrl: null },
      { id: 'm2', question: 'M2', goldPaths: ['b.md'], goldAnswer: 'BETA', sourceUrl: null },
      { id: 'm3', question: 'M3', goldPaths: ['c.md'], goldAnswer: 'GAMMA', sourceUrl: null },
    ];
    const system = {
      name: 'mixed',
      async run(q) {
        if (q === 'M1') return { promptPayload: 'ALPHA', citedPaths: [], latencyMs: 1, retrievalTokens: 0 }; // -> correct
        if (q === 'M2') return { promptPayload: 'WRONG', citedPaths: [], latencyMs: 1, retrievalTokens: 0 }; // -> incorrect
        // FIX 1: a non-closed-book system with an empty payload now throws
        // (it's a broken run), so abstention here is exercised through a
        // real, non-empty payload whose echoed candidate the judge's local
        // ABSTENTION detector recognises directly — not through '' standing
        // in for "the system had nothing to say".
        return { promptPayload: "I don't know.", citedPaths: [], latencyMs: 1, retrievalTokens: 0 }; // -> abstained
      },
    };
    const r = await runStageB({ systems: [system], questions: mixed, ctx: {}, llm, judgeLlm });
    const s = r.perSystem.mixed;
    expect(s.accuracy).toBe(0.3333);
    expect(s.fabricationRate).toBe(0.3333);
    expect(s.abstentionRate).toBe(0.3333);
  });

  // Resolution 3: `subsample: { x: 0 }` is falsy, and `cap ? slice(0, cap) :
  // questions` silently treats "asked for zero" as "no cap at all" — the
  // system would run every question instead of none. A supplied cap that
  // isn't a positive integer must fail loudly instead.
  it('rejects a subsample cap of 0, naming the system and the bad value', async () => {
    await expect(runStageB({
      systems: [sys('full-context', 'ALPHA BETA')], questions, ctx: {}, llm, judgeLlm,
      subsample: { 'full-context': 0 },
    })).rejects.toThrow(/full-context/);
    await expect(runStageB({
      systems: [sys('full-context', 'ALPHA BETA')], questions, ctx: {}, llm, judgeLlm,
      subsample: { 'full-context': 0 },
    })).rejects.toThrow(/0/);
  });

  it('rejects a non-integer or negative subsample cap', async () => {
    await expect(runStageB({
      systems: [sys('full-context', 'ALPHA BETA')], questions, ctx: {}, llm, judgeLlm,
      subsample: { 'full-context': 1.5 },
    })).rejects.toThrow(/full-context/);
    await expect(runStageB({
      systems: [sys('full-context', 'ALPHA BETA')], questions, ctx: {}, llm, judgeLlm,
      subsample: { 'full-context': -1 },
    })).rejects.toThrow(/full-context/);
  });

  // Resolution 4: contaminatedIds comes from closed-book's own records, but
  // uncontaminatedCount is computed against questions.length. Subsampling
  // closed-book would measure contamination on a slice while reporting the
  // count against the whole set — every uncontaminated headline metric would
  // silently be wrong. The contamination control must never be subsampled.
  it('refuses to subsample the closed-book contamination control', async () => {
    const closedBook = {
      name: 'closed-book',
      closedBook: true,
      async run() { return { promptPayload: '', citedPaths: [], latencyMs: 0, retrievalTokens: 0 }; },
    };
    await expect(runStageB({
      systems: [closedBook], questions, ctx: {}, llm, judgeLlm,
      subsample: { 'closed-book': 1 },
    })).rejects.toThrow(/closed-book/);
  });

  // Resolution 5: rates must be publishable next to their denominator. `n`
  // for the uncontaminated rates specifically must survive contamination
  // filtering, not just reflect the raw record count.
  it('reports scored and scoredUncontaminated counts beside every rate', async () => {
    const closedBook = {
      name: 'closed-book',
      closedBook: true,
      async run() { return { promptPayload: '', citedPaths: [], latencyMs: 0, retrievalTokens: 0 }; },
    };
    const knowing = {
      async complete(_s, user) {
        if (!/Context:/.test(user)) return /Q1/.test(user) ? 'ALPHA' : "I don't know.";
        return /Context:\n([\s\S]*?)\n\nQuestion/.exec(user)[1];
      },
    };
    const r = await runStageB({
      systems: [closedBook, sys('good', 'ALPHA BETA')], questions, ctx: {}, llm: knowing, judgeLlm,
    });
    expect(r.perSystem.good.scored).toBe(2);
    expect(r.perSystem.good.scoredUncontaminated).toBe(1); // q1 is contaminated
  });

  // Resolution 5: a system whose every question errors must still produce a
  // JSON-safe report — the reader needs to see `scored: 0` next to a
  // non-NaN medianTokens, not a number that silently poisons downstream math.
  it('reports a JSON-safe medianTokens and zero scored for a system whose every question errors', async () => {
    const allErrors = {
      name: 'allErrors',
      async run() { throw new Error('always fails'); },
    };
    const r = await runStageB({ systems: [allErrors], questions, ctx: {}, llm, judgeLlm });
    const s = r.perSystem.allErrors;
    expect(s.scored).toBe(0);
    expect(s.scoredUncontaminated).toBe(0);
    expect(s.errors).toHaveLength(2);
    expect(s.medianTokens).toBeNull();
    expect(JSON.parse(JSON.stringify(s)).medianTokens).toBeNull();
  });
});
