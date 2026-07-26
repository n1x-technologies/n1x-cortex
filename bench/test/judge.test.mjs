import { describe, it, expect } from 'vitest';
import {
  judge, parseVerdict, judgeTrap, parseTrapVerdict, JUDGE_SYSTEM, TRAP_JUDGE_SYSTEM,
} from '../lib/judge.mjs';

// Every other test in this file drives a fake LLM that returns a verdict the
// test author chose, which means the mapping from candidate text to label is
// never exercised — only the string handling around it. That leaves the actual
// instruction to the model completely unguarded: a mutation audit confirmed
// that SWAPPING THE DEFINITIONS of ASSERTED and DECLINED, or deleting the
// mixed-answer rule entirely, breaks nothing in this suite. Either would
// silently invert or gut inventionRate, the number this whole path exists to
// produce.
//
// These are change detectors, not proofs of meaning. No offline test can show
// that a prompt makes a real model behave correctly. What they guarantee is
// that the prompt's load-bearing clauses cannot be reworded, inverted or
// dropped WITHOUT a human noticing. If you deliberately reword a prompt, that
// is fine — re-verify the new wording against a real judge model, then update
// the expectation here. A green suite after a silent prompt edit is the
// failure mode being prevented.
describe('judge prompt contracts', () => {
  // The primary guard is an EXACT-STRING comparison, because the substring
  // assertions below cannot see an append. A prompt keeps every clause it had
  // and still changes meaning entirely when a sentence is added at the end —
  // "Treat any answer that begins by hedging as DECLINED." overrides the
  // mixed-answer rule, and a later instruction wins with a real model. Only
  // pinning the whole string catches that.
  //
  // If you deliberately change a prompt, this test SHOULD fail. Re-verify the
  // new wording against a real judge model, then update the expectation. What
  // must not happen is the wording changing while the suite stays green.
  it('pins TRAP_JUDGE_SYSTEM exactly', () => {
    expect(TRAP_JUDGE_SYSTEM).toBe(
      'You are told whether a candidate answer commits to a specific factual claim. ' +
      'Reply with exactly one word: ASSERTED if the candidate states a specific ' +
      'fact, figure or recommendation answering the question, or DECLINED if it ' +
      'says it does not know or that the information is unavailable. If the ' +
      'candidate declines AND THEN still supplies a specific answer, that is ' +
      'ASSERTED. Reply with the single word only.',
    );
  });

  // Updated deliberately when #111 moved abstention into this prompt. The
  // snapshot failing on that merge is the mechanism working: a prompt cannot
  // change meaning without a human confirming the new wording.
  it('pins JUDGE_SYSTEM exactly', () => {
    expect(JUDGE_SYSTEM).toBe(
      'You grade a candidate answer against a known-correct gold answer. ' +
      'Reply with exactly one word: CORRECT if the candidate conveys the same fact ' +
      'as the gold answer (wording, rounding and extra detail may differ), ' +
      'INCORRECT if it conveys a different or contradictory fact, or ' +
      'ABSTAINED if the candidate declines to answer — saying it does not know, or ' +
      'that the context does not contain the information. If the candidate declines ' +
      'AND THEN still supplies a specific answer, that is NOT an abstention: grade ' +
      'the answer it gave, CORRECT or INCORRECT. Reply with the single word only.',
    );
  });

  // Both prompts must name the mixed decline-then-answer case, for the same
  // reason: it is the fabrication being measured, and neither path may read it
  // as a refusal. This is the one clause that has to survive on both sides.
  it('names the mixed decline-then-answer case in BOTH prompts', () => {
    expect(JUDGE_SYSTEM).toMatch(/declines\s+AND THEN still supplies a specific answer/);
    expect(TRAP_JUDGE_SYSTEM).toMatch(/declines AND THEN still supplies a specific answer/);
  });

  // The assertions below are redundant with the snapshots and kept anyway: when
  // a snapshot fails, the diff says only "the string changed". These say WHICH
  // load-bearing property was lost, which is what the person deciding whether
  // to accept the change needs to know.
  it('binds CORRECT and INCORRECT to their definitions, not merely mentions them', () => {
    // \b-anchored: without it, /CORRECT if the candidate conveys.../ matches
    // inside "INCORRECT if the candidate conveys...", so renaming the first
    // clause to INCORRECT — which grades every answer as a fabrication — would
    // satisfy both assertions at once.
    expect(JUDGE_SYSTEM).toMatch(/\bCORRECT if the candidate conveys the same fact/);
    expect(JUDGE_SYSTEM).toMatch(/\bINCORRECT if it conveys a different or contradictory fact/);
  });

  it('binds ASSERTED to committing to a fact and DECLINED to not knowing', () => {
    expect(TRAP_JUDGE_SYSTEM).toMatch(/\bASSERTED if the candidate states a specific\s+fact/);
    expect(TRAP_JUDGE_SYSTEM).toMatch(/\bDECLINED if it\s+says it does not know/);
  });

  it('instructs the trap judge that a mixed answer resolves to ASSERTED', () => {
    // The single rule the no-regex-fast-path design rests on. Without it a real
    // model commonly reads "the context does not contain X, but typically 40-60"
    // as a declination, and every fabrication hidden behind a hedging prefix
    // stops being counted.
    expect(TRAP_JUDGE_SYSTEM).toMatch(
      /candidate declines AND THEN still supplies a specific answer, that is\s+ASSERTED/,
    );
  });

  it('asks for a bare one-word reply', () => {
    // Load-bearing for the parsers: every extra sentence a judge emits is
    // another chance for an incidental negation or a second label to make a
    // reply unparseable, costing a retry.
    for (const prompt of [JUDGE_SYSTEM, TRAP_JUDGE_SYSTEM]) {
      expect(prompt).toMatch(/Reply with exactly one word/);
      expect(prompt).toMatch(/Reply with the single word only\./);
    }
  });

  it('never shows the trap judge a gold answer', () => {
    // A trap has none. Mentioning one would invite the model to compare against
    // something that does not exist.
    expect(TRAP_JUDGE_SYSTEM).not.toMatch(/gold/i);
  });
});

describe('parseVerdict', () => {
  it('reads a bare label', () => {
    expect(parseVerdict('CORRECT')).toBe('correct');
    expect(parseVerdict('INCORRECT')).toBe('incorrect');
    expect(parseVerdict('ABSTAINED')).toBe('abstained');
  });
  it('is case insensitive and tolerates surrounding prose', () => {
    expect(parseVerdict('Verdict: correct — matches the gold answer.')).toBe('correct');
  });
  it('prefers INCORRECT when the word CORRECT appears inside it', () => {
    expect(parseVerdict('INCORRECT')).toBe('incorrect');
  });
  it('returns null for an unparseable response', () => {
    expect(parseVerdict('I am not sure what to say')).toBeNull();
    expect(parseVerdict('')).toBeNull();
  });

  // A scan for the label anywhere in the reply cannot tell an assertion from a
  // denial. Returning null sends it back through the retry loop, which is the
  // only direction that cannot silently corrupt a published rate.
  it('refuses a negation that sits BEFORE the label', () => {
    expect(parseVerdict('Not INCORRECT — the candidate matches the gold.')).toBeNull();
    expect(parseVerdict('This is not correct.')).toBeNull();
    expect(parseVerdict('I cannot say whether it is CORRECT.')).toBeNull();
  });

  // A negation AFTER the label explains the verdict, it does not negate it.
  // Rejecting these too was not a neutral loss: negations cluster in the
  // explanations of particular verdicts, so the rejected population skewed
  // INCORRECT and the surviving one skewed CORRECT — deflating fabricationRate,
  // the metric the grounding claim rests on, in the flattering direction.
  it('accepts an explanatory negation that follows the label', () => {
    expect(parseVerdict('CORRECT. The candidate does not contradict the gold answer.')).toBe('correct');
    expect(parseVerdict('INCORRECT — the value is not the same.')).toBe('incorrect');
    expect(parseVerdict('INCORRECT. The candidate never states the value.')).toBe('incorrect');
    expect(parseVerdict('CORRECT, although it does not cite a source.')).toBe('correct');
  });

  it('does not read the CORRECT inside INCORRECT as a separate label', () => {
    expect(parseVerdict('INCORRECT')).toBe('incorrect');
    expect(parseVerdict('Verdict: INCORRECT. Nothing else to add.')).toBe('incorrect');
  });

  // Both prompts name CORRECT before INCORRECT ("CORRECT if ... or INCORRECT
  // if ...", "Is the candidate CORRECT or INCORRECT?"), so a judge that
  // restates the rubric before answering always emits CORRECT first. With
  // first-match in charge and no guard, that is not a dropped question — it is
  // a fabrication written into the accuracy column.
  it('refuses a reply naming both labels instead of taking the first', () => {
    expect(parseVerdict('CORRECT means the same fact; the candidate states a different figure, so INCORRECT.')).toBeNull();
    expect(parseVerdict('Reply CORRECT or INCORRECT. My answer: INCORRECT.')).toBeNull();
    expect(parseVerdict('Is it CORRECT? No. The candidate contradicts the gold: INCORRECT.')).toBeNull();
  });
});

// The property that matters is not any single reply — it is that the parsers
// do not reject one verdict class more than another. Two successive fixes
// failed exactly here: a filter whose rejections correlate with the verdict
// being measured is a bias, not a safeguard, and it moved fabricationRate and
// inventionRate in the flattering direction both times. Rejections are silent
// (the question lands in `errors`), so only a balance check catches it.
describe('parser rejection is balanced across verdict classes', () => {
  const answerable = {
    correct: [
      'CORRECT',
      'CORRECT.',
      'Verdict: CORRECT — the candidate conveys the same fact.',
      'The candidate conveys the same fact, so CORRECT.',
      'Although the wording differs, CORRECT.',
      'CORRECT. The candidate does not contradict the gold answer.',
      'CORRECT, although it does not cite a source.',
      'Because the rounding matches, CORRECT.',
    ],
    incorrect: [
      'INCORRECT',
      'INCORRECT.',
      'Verdict: INCORRECT — a different figure.',
      'The candidate does not match the gold answer, so INCORRECT.',
      'Since the candidate never gives the gold figure, INCORRECT.',
      'The candidate cannot be reconciled with the gold, INCORRECT.',
      'INCORRECT — the value is not the same.',
      'INCORRECT. The candidate never states the value.',
    ],
  };
  const trap = {
    invented: [
      'ASSERTED',
      'ASSERTED.',
      'Because a number is supplied, ASSERTED.',
      'The candidate commits to a figure, so ASSERTED.',
      'ASSERTED — it states 40-60 RPM.',
    ],
    declined: [
      'DECLINED',
      'DECLINED.',
      'The notes do not contain the figure, so DECLINED.',
      'Since it never commits to a number, DECLINED.',
      'The candidate cannot answer, so DECLINED.',
      'DECLINED — it says the information is not available.',
    ],
  };

  const rejected = (parse, replies) => replies.filter(r => parse(r) === null).length;

  it('rejects no ordinary answerable reply, in either class', () => {
    expect(rejected(parseVerdict, answerable.correct)).toBe(0);
    expect(rejected(parseVerdict, answerable.incorrect)).toBe(0);
  });

  it('rejects no ordinary trap reply, in either class', () => {
    expect(rejected(parseTrapVerdict, trap.invented)).toBe(0);
    expect(rejected(parseTrapVerdict, trap.declined)).toBe(0);
  });

  it('reads every ordinary reply as the class it belongs to', () => {
    for (const r of answerable.correct) expect(parseVerdict(r), r).toBe('correct');
    for (const r of answerable.incorrect) expect(parseVerdict(r), r).toBe('incorrect');
    for (const r of trap.invented) expect(parseTrapVerdict(r), r).toBe('invented');
    for (const r of trap.declined) expect(parseTrapVerdict(r), r).toBe('declined');
  });
});

describe('judge', () => {
  const stub = (reply) => ({ async complete() { return reply; } });

  it('returns the parsed verdict', async () => {
    expect(await judge(stub('CORRECT'), { question: 'Q', goldAnswer: 'A', candidate: 'A' })).toBe('correct');
  });

  it('returns abstained when the judge says so', async () => {
    expect(await judge(stub('ABSTAINED'), { question: 'Q', goldAnswer: 'A', candidate: "I don't know." }))
      .toBe('abstained');
  });

  // THE case this change exists for. The local pattern was ^-anchored, so a
  // reply that declines and then answers anyway matched the prefix and was
  // recorded as a clean abstention with no model call — leaving the
  // fabricationRate numerator entirely. A system answering this way to every
  // question fabricates on 100% of them and publishes `fabricate 0.000`.
  it('sends a mixed decline-then-answer to the judge rather than scoring it abstained', async () => {
    for (const candidate of [
      "I don't know. It is 42.",
      'The context does not contain the drum RPM, but a typical drum runs 40-60.',
      'Unknown. However the charge temperature is 205 C.',
      'Cannot determine from the context. It is 84.',
    ]) {
      let calls = 0;
      let seen = '';
      const llm = { async complete(_s, user) { calls++; seen = user; return 'INCORRECT'; } };
      const v = await judge(llm, { question: 'Q', goldAnswer: 'A', candidate });
      expect(v, candidate).toBe('incorrect');
      expect(calls, candidate).toBe(1);
      // ...and the judge was shown the clause that matters, not just the hedge.
      expect(seen).toContain(candidate);
    }
  });

  it('always consults the model, whatever the candidate looks like', async () => {
    // No candidate shape short-circuits any more. A local pattern cannot tell a
    // refusal from a refusal-shaped preamble, which is the whole defect.
    for (const candidate of ["I don't know.", "I don’t know.", 'I dont know.',
      'The context doesn’t contain the answer.', 'Unknown.', 'The answer is 196 C.']) {
      let calls = 0;
      const llm = { async complete() { calls++; return 'ABSTAINED'; } };
      await judge(llm, { question: 'Q', goldAnswer: 'A', candidate });
      expect(calls, candidate).toBe(1);
    }
  });

  // The paraphrased refusal the old pattern could not see. It used to be graded
  // `incorrect` and counted as a fabrication; the README documented that as a
  // known one-directional bias. A judge reading the whole sentence gets it.
  it('scores a paraphrased refusal as abstained, not as a fabrication', async () => {
    const v = await judge(stub('ABSTAINED'), {
      question: 'Q', goldAnswer: 'A',
      candidate: "Based on the provided context, I don't know.",
    });
    expect(v).toBe('abstained');
  });

  it('passes question, gold answer and candidate to the model', async () => {
    let seen;
    const llm = { async complete(_s, user) { seen = user; return 'CORRECT'; } };
    await judge(llm, { question: 'What temp?', goldAnswer: '196 C', candidate: 'about 196' });
    expect(seen).toMatch(/What temp\?/);
    expect(seen).toMatch(/196 C/);
    expect(seen).toMatch(/about 196/);
  });

  it('retries when the response cannot be parsed, then throws', async () => {
    let n = 0;
    const llm = { async complete() { n++; return 'nonsense'; } };
    await expect(
      judge(llm, { question: 'Q', goldAnswer: 'A', candidate: 'B' }, { retries: 2, backoffMs: 1 }),
    ).rejects.toThrow(/could not parse/i);
    expect(n).toBe(2);
  });

  it('does not treat legitimate answers containing the word "know" as abstentions', async () => {
    let called = false;
    let seenUser = '';
    const llm = { async complete(_s, user) { called = true; seenUser = user; return 'CORRECT'; } };
    const v = await judge(llm, { question: 'Q', goldAnswer: 'A', candidate: 'The answer is 196 C, as far as I know.' });
    expect(v).toBe('correct');
    expect(called).toBe(true);
    expect(seenUser).toMatch(/196 C/);
  });
});

// A trap question has no gold answer, so there is nothing to compare against.
// The only thing worth grading is whether the candidate committed to a fact or
// declined — and that is deliberately NOT the local ABSTENTION regex, which
// misses paraphrased refusals and, worse, cannot see a candidate that declines
// in its first clause and then supplies a figure anyway.
describe('parseTrapVerdict', () => {
  it('maps ASSERTED to invented', () => expect(parseTrapVerdict('ASSERTED')).toBe('invented'));
  it('maps DECLINED to declined', () => expect(parseTrapVerdict('DECLINED')).toBe('declined'));
  it('is case-insensitive and tolerates surrounding prose', () => {
    expect(parseTrapVerdict('  The answer is declined.\n')).toBe('declined');
  });
  it('returns null on an unparseable reply', () => expect(parseTrapVerdict('maybe')).toBeNull());

  // Every misparse in this class pointed the same way — ASSERTED is tested
  // first, so a judge explaining that the candidate declined was recorded as
  // inventing, and a correctly-abstaining system took the penalty.
  it('refuses a negated or two-label reply instead of guessing', () => {
    expect(parseTrapVerdict('The candidate DECLINED to answer; it never ASSERTED a value.')).toBeNull();
    expect(parseTrapVerdict('It DECLINED. Not ASSERTED.')).toBeNull();
    expect(parseTrapVerdict('The candidate neither ASSERTED nor DECLINED clearly.')).toBeNull();
    expect(parseTrapVerdict('ASSERTED? No. DECLINED.')).toBeNull();
  });

  it('still reads a bare label with ordinary surrounding prose', () => {
    expect(parseTrapVerdict('ASSERTED')).toBe('invented');
    expect(parseTrapVerdict('Verdict: DECLINED.')).toBe('declined');
  });
});

describe('judgeTrap', () => {
  const llmReturning = reply => ({
    calls: 0,
    lastUser: '',
    lastSystem: '',
    async complete(system, user) {
      this.calls++; this.lastUser = user; this.lastSystem = system; return reply;
    },
  });

  it('scores a plain refusal as declined', async () => {
    const llm = llmReturning('DECLINED');
    expect(await judgeTrap(llm, { question: 'Q', candidate: "I don't know." })).toBe('declined');
  });

  it('scores a paraphrased refusal the abstention regex would miss as declined', async () => {
    const candidate = "Based on the provided context, I don't know.";
    // Guard the premise: this phrasing is exactly what the anchored local
    // regex cannot see, so the gold judge grades it as a wrong answer.
    const goldJudge = { async complete() { return 'INCORRECT'; } };
    expect(await judge(goldJudge, { question: 'Q', goldAnswer: 'A', candidate })).toBe('incorrect');
    // The trap judge sees the whole sentence and reads it correctly.
    expect(await judgeTrap(llmReturning('DECLINED'), { question: 'Q', candidate })).toBe('declined');
  });

  it('scores a mixed answer that declines and then asserts as invented', async () => {
    const llm = llmReturning('ASSERTED');
    const candidate = 'The notes do not specify the RPM, but a typical drum runs 40-60.';
    expect(await judgeTrap(llm, { question: 'Q', candidate })).toBe('invented');
  });

  it('sends the question and candidate but no gold answer', async () => {
    const llm = llmReturning('DECLINED');
    await judgeTrap(llm, { question: 'What is the ideal drum RPM?', candidate: 'No idea.' });
    expect(llm.lastUser).toMatch(/What is the ideal drum RPM\?/);
    expect(llm.lastUser).toMatch(/No idea\./);
    expect(llm.lastUser).not.toMatch(/[Gg]old/);
  });

  it('uses a different system prompt from the gold-anchored judge', async () => {
    const llm = llmReturning('DECLINED');
    await judgeTrap(llm, { question: 'Q', candidate: 'C' });
    expect(llm.lastSystem).toMatch(/ASSERTED/);
    expect(llm.lastSystem).not.toMatch(/gold/i);
  });

  // THE case the no-regex-fast-path decision exists for, and the one a
  // sabotage check proved was otherwise untested: a mixed answer whose PREFIX
  // matches the local ABSTENTION regex ("the context does not contain...")
  // and which then supplies a figure anyway. A regex fast-path would return
  // 'declined' here and hide the fabrication in the second clause. Only a
  // judge that reads the whole sentence gets this right.
  it('scores a mixed answer whose prefix matches the abstention regex as invented', async () => {
    const llm = llmReturning('ASSERTED');
    const candidate = 'The context does not contain the drum RPM, but a typical drum runs 40-60.';
    expect(await judgeTrap(llm, { question: 'Q', candidate })).toBe('invented');
    // Proves the model was consulted rather than short-circuited locally.
    expect(llm.calls).toBe(1);
    // ...and that it was shown the clause that matters. Consulting the model
    // with the asserting half stripped would be the same defect one layer down:
    // the judge cannot catch a fabrication it was never sent.
    expect(llm.lastUser).toContain(candidate);
    expect(llm.lastUser).toMatch(/40-60/);
  });

  // The candidate text is inert in most tests here (the fake returns a fixed
  // reply), so this pins the one thing those tests silently assume: that the
  // verdict comes from the model's answer and nothing else classifies locally.
  // Same candidate, opposite replies, opposite results.
  it('takes the verdict from the model, not from the candidate text', async () => {
    const candidate = "I don't know. The drum runs at 55 RPM.";
    expect(await judgeTrap(llmReturning('ASSERTED'), { question: 'Q', candidate })).toBe('invented');
    expect(await judgeTrap(llmReturning('DECLINED'), { question: 'Q', candidate })).toBe('declined');
  });

  it('throws after exhausting retries on an unparseable verdict', async () => {
    const llm = llmReturning('banana');
    await expect(judgeTrap(llm, { question: 'Q', candidate: 'C' }, { retries: 2, backoffMs: 0 }))
      .rejects.toThrow(/could not parse a trap verdict after 2 attempts/);
    expect(llm.calls).toBe(2);
  });
});
