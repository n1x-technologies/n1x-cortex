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
 * @param {{retries?: number, backoffMs?: number}} [opts]
 * @returns {Promise<string>}
 */
export async function answer(llm, question, promptPayload, opts = {}) {
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 1000;

  const system = promptPayload ? ANSWER_SYSTEM_GROUNDED : ANSWER_SYSTEM_CLOSED_BOOK;
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
