import { describe, it, expect } from 'vitest';
import { judge, parseVerdict } from '../lib/judge.mjs';

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
