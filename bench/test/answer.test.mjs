import { describe, it, expect } from 'vitest';
import { answer, ANSWER_SYSTEM_GROUNDED, ANSWER_SYSTEM_CLOSED_BOOK } from '../lib/answer.mjs';

const spy = () => {
  const calls = [];
  return {
    calls,
    async complete(system, user) {
      calls.push({ system, user });
      return '  196 C.  ';
    },
  };
};

describe('answer', () => {
  it('trims the model response', async () => {
    expect(await answer(spy(), 'Q', 'ctx')).toBe('196 C.');
  });

  it('uses the grounded system prompt when a payload is present', async () => {
    const llm = spy();
    await answer(llm, 'Q', 'some context');
    expect(llm.calls[0].system).toBe(ANSWER_SYSTEM_GROUNDED);
  });

  it('switches to the closed-book prompt for an empty payload', async () => {
    const llm = spy();
    await answer(llm, 'Q', '');
    expect(llm.calls[0].system).toBe(ANSWER_SYSTEM_CLOSED_BOOK);
    expect(llm.calls[0].user).not.toMatch(/Context/);
  });

  it('includes both the payload and the question in the user message', async () => {
    const llm = spy();
    await answer(llm, 'What temperature?', 'FIRST CRACK IS 196 C');
    expect(llm.calls[0].user).toMatch(/FIRST CRACK IS 196 C/);
    expect(llm.calls[0].user).toMatch(/What temperature\?/);
  });

  it('retries on failure and succeeds on a later attempt', async () => {
    let n = 0;
    const llm = {
      async complete() {
        if (++n < 3) throw new Error('rate limited');
        return 'ok';
      },
    };
    expect(await answer(llm, 'Q', 'c', { retries: 3, backoffMs: 1 })).toBe('ok');
    expect(n).toBe(3);
  });

  it('throws after exhausting retries', async () => {
    const llm = { async complete() { throw new Error('always down'); } };
    await expect(answer(llm, 'Q', 'c', { retries: 2, backoffMs: 1 })).rejects.toThrow(/always down/);
  });
});
