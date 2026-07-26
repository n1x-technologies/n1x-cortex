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
