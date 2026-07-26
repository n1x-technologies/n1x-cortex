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
 * @param {{retries?: number, backoffMs?: number, isClosedBook?: boolean, systemName?: string}} [opts]
 *   `isClosedBook` selects the closed-book system prompt. It must be set
 *   ONLY for the system that declares `export const closedBook = true`
 *   (bench/lib/systems/closed-book.mjs) — never inferred from an empty
 *   payload. Any OTHER system returning '' is a broken run (e.g. an agent
 *   that answered on turn 0 before using any tool, or a retriever with zero
 *   hits), not a quietly different measurement, so it throws instead of
 *   silently falling back to the closed-book prompt. `systemName` is used
 *   only to name the offending system in that error.
 * @returns {Promise<string>}
 */
export async function answer(llm, question, promptPayload, opts = {}) {
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 1000;
  const isClosedBook = opts.isClosedBook ?? false;

  if (!promptPayload && !isClosedBook) {
    throw new Error(
      `answer: system "${opts.systemName ?? 'unknown'}" returned an empty promptPayload ` +
        'but is not declared closed-book. A grounded system with nothing to say is a ' +
        'broken run, not a closed-book answer — if this system IS the contamination ' +
        'control, it must declare `export const closedBook = true` ' +
        '(see bench/lib/systems/closed-book.mjs).',
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
