// Judging is a comparison against a known gold answer, not an open-ended
// assessment — that is what makes it reliable enough to publish. Three labels,
// because fabrication rate (incorrect AND not abstained) is the metric the
// grounding claim rests on.
//
// Abstention is detected locally rather than delegated to the judge: it is a
// closed set of phrasings fixed by the answering prompt, and spending a model
// call on it would add noise to a deterministic decision.

export const JUDGE_SYSTEM =
  'You grade a candidate answer against a known-correct gold answer. ' +
  'Reply with exactly one word: CORRECT if the candidate conveys the same fact ' +
  'as the gold answer (wording, rounding and extra detail may differ), or ' +
  'INCORRECT if it conveys a different or contradictory fact. Reply with the ' +
  'single word only.';

// Apostrophes are written as escapes, not literals: models emit U+2019 (right
// single quotation mark) and U+02BC (modifier letter apostrophe) regardless of
// the prompt asking for a plain `I don't know.`, and a literal class is too easy
// to get wrong by eye. A missed abstention is graded `incorrect` and inflates
// fabrication rate — the headline metric — so this class is load-bearing.
const APOS = '[\\u0027\\u2019\\u02bc]?';
const ABSTENTION = new RegExp(
  `^\\s*(i don${APOS}t know|i do not know|unknown|not sure|no information|` +
    `the context (does not|doesn${APOS}t) (contain|include|provide)|` +
    `cannot determine|unable to determine)`,
  'i',
);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** @returns {'correct'|'incorrect'|'abstained'|null} */
export function parseVerdict(raw) {
  if (!raw) return null;
  const t = raw.toUpperCase();
  // INCORRECT contains CORRECT, so it must be tested first.
  if (t.includes('INCORRECT')) return 'incorrect';
  if (t.includes('ABSTAIN')) return 'abstained';
  if (t.includes('CORRECT')) return 'correct';
  return null;
}

/**
 * @param {{complete(system: string, user: string): Promise<string>}} llm
 * @param {{question: string, goldAnswer: string, candidate: string}} item
 * @param {{retries?: number, backoffMs?: number}} [opts]
 * @returns {Promise<'correct'|'incorrect'|'abstained'>}
 */
export async function judge(llm, item, opts = {}) {
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 1000;

  if (ABSTENTION.test(item.candidate.trim())) return 'abstained';

  const user =
    `Question: ${item.question}\n` +
    `Gold answer: ${item.goldAnswer}\n` +
    `Candidate answer: ${item.candidate}\n\n` +
    `Is the candidate CORRECT or INCORRECT?`;

  let last = '';
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      last = await llm.complete(JUDGE_SYSTEM, user);
      const verdict = parseVerdict(last);
      if (verdict) return verdict;
    } catch (e) {
      last = e.message;
    }
    if (attempt < retries - 1) await sleep(backoffMs * 2 ** attempt);
  }
  throw new Error(`judge: could not parse a verdict after ${retries} attempts. Last response: ${last}`);
}
