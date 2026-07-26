// Judging is a comparison against a known gold answer, not an open-ended
// assessment — that is what makes it reliable enough to publish. Three labels,
// because fabrication rate (incorrect AND not abstained) is the metric the
// grounding claim rests on.
//
// Abstention is decided by the judge, not by a local pattern.
//
// It used to be a ^-anchored regex over a closed list of phrasings, on the
// argument that the answering prompt fixes those phrasings and a model call
// would add noise to a deterministic decision. The premise does not hold, and
// the failure is not symmetric.
//
// Because the regex is anchored to the PREFIX, a mixed answer — one that
// declines in its first clause and then supplies a figure anyway — matches and
// is recorded as a clean abstention, with zero model calls. `"I don't know. It
// is 42."` is scored `abstained`, leaves the fabricationRate numerator
// entirely, and a system that answers that way to every question fabricates on
// 100% of them while publishing `fabricate 0.000`.
//
// That also corrupts the contamination control: a `closed-book` answer that
// prefixes a decline is never graded `correct`, so a question the model
// provably knew from pretraining counts as uncontaminated, and
// accuracyUncontaminated can read 1.000 over a fully contaminated set.
//
// A judge that reads the whole answer is the only thing that can tell a
// refusal from a refusal-shaped preamble, so the third label moves into the
// prompt with the mixed case named explicitly. The cost is one model call per
// abstention that previously short-circuited, which is a minority of any run
// and cheap next to publishing a fabrication rate that is wrong in the
// flattering direction.

export const JUDGE_SYSTEM =
  'You grade a candidate answer against a known-correct gold answer. ' +
  'Reply with exactly one word: CORRECT if the candidate conveys the same fact ' +
  'as the gold answer (wording, rounding and extra detail may differ), ' +
  'INCORRECT if it conveys a different or contradictory fact, or ' +
  'ABSTAINED if the candidate declines to answer — saying it does not know, or ' +
  'that the context does not contain the information. If the candidate declines ' +
  'AND THEN still supplies a specific answer, that is NOT an abstention: grade ' +
  'the answer it gave, CORRECT or INCORRECT. Reply with the single word only.';

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

  const user =
    `Question: ${item.question}\n` +
    `Gold answer: ${item.goldAnswer}\n` +
    `Candidate answer: ${item.candidate}\n\n` +
    `Is the candidate CORRECT, INCORRECT, or ABSTAINED?`;

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
