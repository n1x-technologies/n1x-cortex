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
const llm = { async complete(_s, user) { return /Context:\n([\s\S]*?)\n\nQuestion/.exec(user)?.[1] ?? "I don't know."; } };
const judgeLlm = {
  async complete(_s, user) {
    const gold = /Gold answer: (.*)/.exec(user)[1];
    const cand = /Candidate answer: (.*)/.exec(user)[1];
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

    // A system that answered nothing must not publish the best possible score
    // on the metric the grounding claim rests on. 0.000 reads as "measured
    // zero fabrication"; there was no measurement at all.
    expect(s.fabricationRate).toBeNull();
    expect(s.accuracy).toBeNull();
    expect(s.abstentionRate).toBeNull();
    expect(s.accuracyUncontaminated).toBeNull();
    expect(s.fabricationRateUncontaminated).toBeNull();
  });
  // ---- trap questions (answerable: false) ----
  // A trap is a question the corpus does not answer. The three judge labels
  // invert meaning across the two kinds: on an answerable question abstaining
  // is a failure, on a trap it is the correct response. So they are scored
  // separately and never averaged together.
  const trap = { id: 't1', question: 'TRAP', goldPaths: [], goldAnswer: null,
    sourceUrl: null, answerable: false, nearMissPaths: ['b.md'] };
  const ans = (id, gold) => ({ id, question: id.toUpperCase(), goldPaths: ['a.md'],
    goldAnswer: gold, sourceUrl: null, answerable: true, nearMissPaths: [] });

  // Covers both judge paths: the trap prompt asks ASSERTED/DECLINED, the
  // gold-anchored prompt asks CORRECT/INCORRECT.
  const bothJudge = {
    async complete(system, user) {
      if (/ASSERTED/.test(system)) {
        return /I don't know/.test(user) ? 'DECLINED' : 'ASSERTED';
      }
      const gold = /Gold answer: (.*)/.exec(user)[1];
      const cand = /Candidate answer: (.*)/.exec(user)[1];
      return cand.includes(gold) ? 'CORRECT' : 'INCORRECT';
    },
  };

  it('routes a trap to the trap judge and reports inventionRate', async () => {
    const r = await runStageB({
      systems: [sys('s', 'ALPHA')],
      questions: [ans('q1', 'ALPHA'), trap],
      ctx: {}, llm, judgeLlm: bothJudge,
    });
    const s = r.perSystem.s;
    expect(s.inventionRate).toBe(1);   // payload 'ALPHA' is asserted on the trap
    expect(s.trapScored).toBe(1);
    expect(s.accuracy).toBe(1);        // answerable side unaffected
    expect(s.scored).toBe(1);          // answerable denominator excludes the trap
  });

  // Traps are authored at the tail of a dataset, so a plain leading slice drops
  // every one of them. That silently removed full-context — the reference
  // system — from the only fabrication-on-absent-facts comparison, in exactly
  // the configuration meant for publication.
  const trap2 = { id: 't2', question: 'TRAP2', goldPaths: [], goldAnswer: null,
    sourceUrl: null, answerable: false, nearMissPaths: ['b.md'] };
  const tailTraps = [ans('q1', 'ALPHA'), ans('q2', 'ALPHA'), ans('q3', 'ALPHA'), trap, trap2];

  it('subsamples answerable questions but asks every trap', async () => {
    const r = await runStageB({
      systems: [sys('full-context', 'ALPHA')],
      questions: tailTraps,
      ctx: {}, llm, judgeLlm: bothJudge,
      subsample: { 'full-context': 2 },
    });
    const s = r.perSystem['full-context'];
    expect(s.scored).toBe(2);       // capped to two answerable questions
    expect(s.trapScored).toBe(2);   // both traps asked despite the cap
    expect(s.asked).toBe(4);
  });

  it('gives a capped and an uncapped system the same trap denominator', async () => {
    // The invention column is only meaningful if every system faced the same
    // traps. A proportional sample would put one system's rate over 3 traps and
    // another's over 4 in the same column and call them comparable.
    const r = await runStageB({
      systems: [sys('full-context', 'ALPHA'), sys('cortex', 'ALPHA')],
      questions: tailTraps,
      ctx: {}, llm, judgeLlm: bothJudge,
      subsample: { 'full-context': 1 },
    });
    expect(r.perSystem['full-context'].trapScored).toBe(2);
    expect(r.perSystem.cortex.trapScored).toBe(2);
    expect(r.perSystem['full-context'].inventionRate)
      .toBe(r.perSystem.cortex.inventionRate);
    // ...and the cap still did its job on the expensive half.
    expect(r.perSystem['full-context'].scored).toBe(1);
    expect(r.perSystem.cortex.scored).toBe(3);
  });

  it('reports the answerable rates as null on a trap-only dataset', async () => {
    // The mirror of "inventionRate is null when there are no traps": with no
    // answerable questions there is no accuracy or fabrication to report, and
    // 0.000 in those columns would read as a result.
    const r = await runStageB({
      systems: [sys('s', 'ALPHA')],
      questions: [trap, trap2],
      ctx: {}, llm, judgeLlm: bothJudge,
    });
    const s = r.perSystem.s;
    expect(s.scored).toBe(0);
    expect(s.accuracy).toBeNull();
    expect(s.fabricationRate).toBeNull();
    expect(s.abstentionRate).toBeNull();
    expect(s.inventionRate).toBe(1);   // the half that WAS measured still reports
    expect(s.trapScored).toBe(2);
  });

  it('reports contamination against the answerable count, not the whole set', async () => {
    // contaminatedIds excludes traps by construction, so dividing by
    // questionCount deflated the reported rate by every trap added.
    const r = await runStageB({
      systems: [sys('s', 'ALPHA')],
      questions: tailTraps,
      ctx: {}, llm, judgeLlm: bothJudge,
    });
    expect(r.questionCount).toBe(5);
    expect(r.answerableCount).toBe(3);
  });

  it('reports inventionRate as null when the dataset has no traps', async () => {
    const r = await runStageB({
      systems: [sys('s', 'ALPHA')], questions: [ans('q1', 'ALPHA')],
      ctx: {}, llm, judgeLlm: bothJudge,
    });
    expect(r.perSystem.s.inventionRate).toBeNull();
    expect(r.perSystem.s.trapScored).toBe(0);
  });

  it('computes exact fractional rates over mixed answerable and trap outcomes', async () => {
    // Three answerable: one correct, one incorrect, one abstained.
    // Two traps: one declined, one invented. Homogeneous fixtures would give
    // rates of exactly 0 or 1, under which rate() could be a boolean.
    const qs = [ans('q1', 'ALPHA'), ans('q2', 'ZETA'), ans('q3', 'OMEGA'),
      { ...trap, id: 't1' }, { ...trap, id: 't2' }];
    const payloadFor = { Q1: 'ALPHA', Q2: 'GAMMA', Q3: "I don't know." };
    let trapSeen = 0;
    const mixed = {
      name: 's',
      async run(q) {
        const p = q === 'TRAP' ? (trapSeen++ === 0 ? "I don't know." : 'ALPHA') : payloadFor[q];
        return { promptPayload: p, citedPaths: ['a.md'], latencyMs: 1, retrievalTokens: 0 };
      },
    };
    const r = await runStageB({ systems: [mixed], questions: qs, ctx: {}, llm, judgeLlm: bothJudge });
    const s = r.perSystem.s;
    expect(s.accuracy).toBe(0.3333);
    expect(s.fabricationRate).toBe(0.3333);
    expect(s.abstentionRate).toBe(0.3333);
    expect(s.inventionRate).toBe(0.5);
    expect(s.scored).toBe(3);
    expect(s.trapScored).toBe(2);
  });

  it('never marks a trap as contaminated', async () => {
    const closedBook = {
      name: 'closed-book', closedBook: true,
      async run() { return { promptPayload: '', citedPaths: [], latencyMs: 0, retrievalTokens: 0 }; },
    };
    // This answering model "knows" both the answerable question and the trap.
    const knowing = { async complete(_s, user) {
      if (!/Context:/.test(user)) return 'ALPHA';
      return /Context:\n([\s\S]*?)\n\nQuestion/.exec(user)[1];
    } };
    const r = await runStageB({
      systems: [closedBook], questions: [ans('q1', 'ALPHA'), trap],
      ctx: {}, llm: knowing, judgeLlm: bothJudge,
    });
    expect(r.contaminatedIds).toEqual(['q1']);   // the trap is not in here
    expect(r.answerableCount).toBe(1);
    expect(r.uncontaminatedCount).toBe(0);
  });

  it('tags each record with whether its question was answerable', async () => {
    const r = await runStageB({
      systems: [sys('s', 'ALPHA')], questions: [ans('q1', 'ALPHA'), trap],
      ctx: {}, llm, judgeLlm: bothJudge,
    });
    expect(r.perSystem.s.records.map(x => [x.id, x.answerable]))
      .toEqual([['q1', true], ['t1', false]]);
  });

  it('treats a question with no `answerable` field as answerable, like loadDataset does', async () => {
    // The module-level `questions` fixture omits the field entirely.
    const r = await runStageB({ systems: [sys('s', 'ALPHA BETA')], questions, ctx: {}, llm, judgeLlm });
    expect(r.perSystem.s.scored).toBe(2);
    expect(r.perSystem.s.trapScored).toBe(0);
    expect(r.perSystem.s.inventionRate).toBeNull();
  });
});
