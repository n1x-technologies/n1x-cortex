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
  it('binds CORRECT and INCORRECT to their definitions, not merely mentions them', () => {
    expect(JUDGE_SYSTEM).toMatch(/CORRECT if the candidate conveys the same fact/);
    expect(JUDGE_SYSTEM).toMatch(/INCORRECT if it conveys a different or contradictory fact/);
  });

  it('binds ASSERTED to committing to a fact and DECLINED to not knowing', () => {
    expect(TRAP_JUDGE_SYSTEM).toMatch(/ASSERTED if the candidate states a specific\s+fact/);
    expect(TRAP_JUDGE_SYSTEM).toMatch(/DECLINED if it\s+says it does not know/);
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
  it('refuses a negated mention rather than reading it as the verdict', () => {
    expect(parseVerdict('Not INCORRECT — the candidate matches the gold.')).toBeNull();
    expect(parseVerdict('This is not correct.')).toBeNull();
    expect(parseVerdict('I cannot say whether it is CORRECT.')).toBeNull();
  });
});

describe('judge', () => {
  const stub = (reply) => ({ async complete() { return reply; } });

  it('returns the parsed verdict', async () => {
    expect(await judge(stub('CORRECT'), { question: 'Q', goldAnswer: 'A', candidate: 'A' })).toBe('correct');
  });

  it('short-circuits an explicit abstention without calling the model', async () => {
    let called = false;
    const llm = { async complete() { called = true; return 'CORRECT'; } };
    const v = await judge(llm, { question: 'Q', goldAnswer: 'A', candidate: "I don't know." });
    expect(v).toBe('abstained');
    expect(called).toBe(false);
  });

  it('recognises abstention phrasings', async () => {
    const llm = stub('CORRECT');
    for (const c of ["I don't know", 'I do not know.', 'The context does not contain the answer.']) {
      expect(await judge(llm, { question: 'Q', goldAnswer: 'A', candidate: c })).toBe('abstained');
    }
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

  it("recognises 'don't know.' (straight apostrophe U+0027) as abstention without calling model", async () => {
    let called = false;
    const llm = { async complete() { called = true; return 'CORRECT'; } };
    const v = await judge(llm, { question: 'Q', goldAnswer: 'A', candidate: "I don't know." });
    expect(v).toBe('abstained');
    expect(called).toBe(false);
  });

  it("recognises 'don’t know.' (right single quotation mark U+2019) as abstention without calling model", async () => {
    let called = false;
    const llm = { async complete() { called = true; return 'CORRECT'; } };
    const v = await judge(llm, { question: 'Q', goldAnswer: 'A', candidate: "I don’t know." });
    expect(v).toBe('abstained');
    expect(called).toBe(false);
  });

  it("recognises 'donʼt know.' (modifier letter apostrophe U+02BC) as abstention without calling model", async () => {
    let called = false;
    const llm = { async complete() { called = true; return 'CORRECT'; } };
    const v = await judge(llm, { question: 'Q', goldAnswer: 'A', candidate: "I donʼt know." });
    expect(v).toBe('abstained');
    expect(called).toBe(false);
  });

  it("recognises 'dont know.' (no apostrophe) as abstention without calling model", async () => {
    let called = false;
    const llm = { async complete() { called = true; return 'CORRECT'; } };
    const v = await judge(llm, { question: 'Q', goldAnswer: 'A', candidate: "I dont know." });
    expect(v).toBe('abstained');
    expect(called).toBe(false);
  });

  it("recognises 'doesn’t contain' (right single quotation mark U+2019) as abstention without calling model", async () => {
    let called = false;
    const llm = { async complete() { called = true; return 'CORRECT'; } };
    const v = await judge(llm, { question: 'Q', goldAnswer: 'A', candidate: "The context doesn’t contain the answer." });
    expect(v).toBe('abstained');
    expect(called).toBe(false);
  });

  // FIX 7 (Important, honest-boundary disclosure): ABSTENTION is a
  // ^-anchored regex over a fixed phrase list. A paraphrased refusal that
  // doesn't start with one of those exact phrasings is NOT recognised
  // locally and falls through to the judge model — where, absent a matching
  // gold answer, it is graded 'incorrect' and counted in the
  // fabrication-rate numerator. This pins that known limitation in the
  // suite (bench/README.md's honest boundary states it in prose) rather
  // than leaving it visible only in judge.mjs's module comment. This is a
  // documented gap, NOT something to fix by widening the regex here.
  it('does NOT recognise a paraphrased refusal as abstention (documented limitation, see README honest boundary)', async () => {
    const llm = stub('INCORRECT');
    const v = await judge(llm, {
      question: 'Q',
      goldAnswer: 'A',
      candidate: "Based on the provided context, I don't know.",
    });
    expect(v).toBe('incorrect');
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
