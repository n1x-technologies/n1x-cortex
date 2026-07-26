// The single answering path. Every system's promptPayload flows through here
// with the same model and the same system prompt, which makes the answering
// model a controlled variable and any difference between systems attributable
// to retrieval alone. Nothing else in the bench may call the LLM to answer.

export const ANSWER_SYSTEM_GROUNDED =
  'Answer the question using ONLY the provided context. Reply with one short ' +
  'sentence. If the context does not contain the answer, reply exactly: I don\'t know.';

export const ANSWER_SYSTEM_CLOSED_BOOK =
  'Answer the question from your own knowledge. Reply with one short sentence. ' +
  'If you do not know, reply exactly: I don\'t know.';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param {{complete(system: string, user: string): Promise<string>}} llm
 * @param {string} question
 * @param {string} promptPayload  '' for the closed-book control
 * @param {{retries?: number, backoffMs?: number, isClosedBook?: boolean, systemName?: string, answerable?: boolean}} [opts]
 *   `isClosedBook` selects the closed-book system prompt. It must be set
 *   ONLY for the system that declares `export const closedBook = true`
 *   (bench/lib/systems/closed-book.mjs) — never inferred from an empty
 *   payload. On an ANSWERABLE question, any other system returning '' is a
 *   broken run (e.g. an agent that answered on turn 0 before using any tool,
 *   or a retriever with zero hits), not a quietly different measurement, so
 *   it throws instead of silently falling back to the closed-book prompt.
 *   `systemName` is used only to name the offending system in that error.
 *
 *   `answerable: false` exempts the question from that rule, because on a
 *   TRAP the premise inverts. The rule reads an empty payload as "this system
 *   is broken" — true when an answer exists to be found and the system found
 *   nothing. On a trap there is nothing to find, so an agent that searches and
 *   comes back empty-handed did the right thing, and throwing turns correct
 *   behaviour into a dropped question. That is not hypothetical: grep-agent
 *   hit exactly this on t1 in the first live Stage B run, losing a trap from
 *   its denominator and taking its rates out of publishable range.
 *
 *   The empty payload is passed through to the GROUNDED prompt, not the
 *   closed-book one — "I searched and found nothing" is a grounded result, and
 *   the grounded prompt's instruction to reply "I don't know" when the context
 *   lacks the answer is exactly the right response to it. Scoring it as
 *   `declined` is then a real measurement rather than an error.
 * @returns {Promise<string>}
 */
export async function answer(llm, question, promptPayload, opts = {}) {
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 1000;
  const isClosedBook = opts.isClosedBook ?? false;
  const answerable = opts.answerable ?? true;

  if (!promptPayload && !isClosedBook && answerable) {
    throw new Error(
      `answer: system "${opts.systemName ?? 'unknown'}" returned an empty promptPayload ` +
        'on an ANSWERABLE question but is not declared closed-book. A grounded system ' +
        'with nothing to say where an answer exists is a broken run, not a closed-book ' +
        'answer — if this system IS the contamination control, it must declare ' +
        '`export const closedBook = true` (see bench/lib/systems/closed-book.mjs). ' +
        'On a trap question an empty payload is allowed: there is nothing to find.',
    );
  }

  const system = isClosedBook ? ANSWER_SYSTEM_CLOSED_BOOK : ANSWER_SYSTEM_GROUNDED;
  const user = promptPayload
    ? `Context:\n${promptPayload}\n\nQuestion: ${question}`
    : `Question: ${question}`;

  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return (await llm.complete(system, user)).trim();
    } catch (e) {
      lastError = e;
      if (attempt < retries - 1) await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastError;
}
