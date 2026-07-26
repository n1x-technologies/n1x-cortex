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

  it('uses the closed-book prompt for an empty payload ONLY when declared via opts.isClosedBook', async () => {
    const llm = spy();
    await answer(llm, 'Q', '', { isClosedBook: true });
    expect(llm.calls[0].system).toBe(ANSWER_SYSTEM_CLOSED_BOOK);
    expect(llm.calls[0].user).not.toMatch(/Context/);
  });

  // FIX 1 (Critical): the closed-book prompt used to be selected by an
  // implicit falsy check on promptPayload. Any grounded system that returns
  // '' (grep-agent answering on turn 0, a zero-hit retriever, an empty
  // naive-rag chunk set) would silently be routed into the closed-book
  // prompt and credited/blamed as if it had no context by design. An empty
  // payload from a system that is NOT declared `closedBook` must throw,
  // naming the offending system, instead of being reinterpreted.
  it('throws, naming the system, when a non-closed-book system returns an empty payload', async () => {
    const llm = spy();
    await expect(answer(llm, 'Q', '', { systemName: 'grep-agent' }))
      .rejects.toThrow(/grep-agent/);
    expect(llm.calls).toHaveLength(0);
  });

  it('throws on an empty payload even with no opts at all', async () => {
    const llm = spy();
    await expect(answer(llm, 'Q', '')).rejects.toThrow(/empty promptPayload/);
  });

  // The rule above reads an empty payload as "this system is broken", which is
  // true only when an answer exists to be found. On a TRAP there is nothing to
  // find, so a search that comes back empty-handed is the CORRECT outcome and
  // throwing turns it into a dropped question. grep-agent hit exactly this on
  // t1 in the first live Stage B run: one trap lost from its denominator, and
  // its rates out of publishable range.
  it('allows an empty payload on a trap, where there is nothing to find', async () => {
    const llm = spy();
    const out = await answer(llm, 'Q', '', { systemName: 'grep-agent', answerable: false });
    expect(llm.calls).toHaveLength(1);
    expect(out).toBeTruthy();
  });

  it('uses the GROUNDED prompt for an empty trap payload, not the closed-book one', async () => {
    // "I searched and found nothing" is a grounded result. The grounded
    // prompt's instruction to reply "I don't know" when the context lacks the
    // answer is exactly the right response — routing it to the closed-book
    // prompt would instead invite the model to answer from memory, which on a
    // trap is precisely the invention being measured.
    const llm = spy();
    await answer(llm, 'Q', '', { systemName: 'grep-agent', answerable: false });
    expect(llm.calls[0].system).toBe(ANSWER_SYSTEM_GROUNDED);
    expect(llm.calls[0].system).not.toBe(ANSWER_SYSTEM_CLOSED_BOOK);
  });

  it('still throws for an empty payload on an answerable question', async () => {
    // The exemption is scoped to traps and must not widen: on an answerable
    // question an empty payload is still a broken run.
    const llm = spy();
    await expect(answer(llm, 'Q', '', { systemName: 'grep-agent', answerable: true }))
      .rejects.toThrow(/grep-agent/);
    expect(llm.calls).toHaveLength(0);
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
