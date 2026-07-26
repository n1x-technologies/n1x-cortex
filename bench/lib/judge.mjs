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

/**
 * `?? 3` protects undefined but not an explicit 0, which skipped the loop
 * entirely and threw "could not parse a verdict after 0 attempts" without ever
 * calling the model — a confusing way to say "you asked for no attempts".
 * validateSubsample in stage-b.mjs rejects a 0 explicitly for the same reason.
 */
function resolveRetries(v) {
  if (v === undefined) return 3;
  if (!Number.isInteger(v) || v < 1) {
    throw new Error(`retries must be a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

// Both prompts ask for exactly one word, and both parsers scan for the label
// anywhere in the reply so a judge that adds a sentence still parses. That
// leniency has a failure mode: a NEGATED mention reads as an assertion of the
// label. "Not INCORRECT — the candidate matches the gold" scored a correct
// answer as a fabrication; "the candidate DECLINED, it never ASSERTED a value"
// scored a correctly-declining system as inventing.
//
// A negation is only disqualifying when it sits BEFORE the label — "Not
// INCORRECT" negates the verdict; "INCORRECT, the value is not the same"
// merely explains it. Scanning the whole reply rejected the second kind too,
// and that is not a neutral loss: negations cluster in the explanations of
// particular verdicts, so the rejected population skewed toward INCORRECT on
// the answerable path and DECLINED on the trap path. Questions were dropped
// into `errors` (stage-b.mjs catches per question), which DEFLATED
// fabricationRate and INFLATED inventionRate — both in the flattering
// direction, at 3x the judge spend, with `[N errors]` as the only signal.
//
// So the window is the CLAUSE preceding the label, not all preceding text.
// Widening it to the whole prefix reintroduced the same asymmetry one step
// down: a judge that explains before it answers puts the negation in a leading
// subordinate clause, and negative explanations only precede negative
// verdicts. Measured on a constructed corpus, whole-prefix scanning rejected
// 25% of INCORRECT-shaped replies and 0% of CORRECT-shaped ones (27%/0% on the
// trap pair) — the same flattering skew at reduced amplitude.
//
// Disclosed cost: a negation split across a clause break is now missed. "The
// candidate is not, in my view, CORRECT." parses as `correct`. That is rarer
// than the class this buys back — a judge that has the word INCORRECT
// available rarely writes "not CORRECT" instead — but it is a real silent
// misread, and bench/README.md's honest boundary says so.
const NEGATED = /\b(?:not|never|neither|nor|without|isn't|isn’t|wasn't|wasn’t|doesn't|doesn’t|didn't|didn’t|cannot|can't|can’t)\b/i;

// \b-anchored, so no label can be found inside another word.
const VERDICT_LABEL = /\b(INCORRECT|CORRECT|ABSTAIN[A-Z]*)\b/;
const TRAP_LABEL = /\b(ASSERTED|DECLINED)\b/;

const CLAUSE_BREAK = /[,;:.!?()\n—–-]/;

/** The clause immediately before `index` — the only place a negation negates. */
const clauseBefore = (raw, index) => raw.slice(0, index).split(CLAUSE_BREAK).pop();

/** @returns {'correct'|'incorrect'|'abstained'|null} */
export function parseVerdict(raw) {
  if (!raw) return null;
  const t = raw.toUpperCase();
  // The same both-labels guard parseTrapVerdict has, and for a sharper reason
  // here. Dropping the old INCORRECT-before-CORRECT ordering left first-match
  // in charge, and BOTH the system prompt ("CORRECT if ... or INCORRECT if
  // ...") and the user prompt ("Is the candidate CORRECT or INCORRECT?") put
  // CORRECT first — so a judge that restates the rubric before answering
  // ("...the candidate states a different figure, so INCORRECT.") was read as
  // `correct`. Not a drop into errors: a WRONG verdict written into records,
  // moving a fabrication into the accuracy column.
  if (/\bINCORRECT\b/.test(t) && /\bCORRECT\b/.test(t)) return null;
  const m = VERDICT_LABEL.exec(t);
  if (!m) return null;
  if (NEGATED.test(clauseBefore(raw, m.index))) return null;
  if (m[1] === 'INCORRECT') return 'incorrect';
  if (m[1].startsWith('ABSTAIN')) return 'abstained';
  return 'correct';
}

/**
 * @param {{complete(system: string, user: string): Promise<string>}} llm
 * @param {{question: string, goldAnswer: string, candidate: string}} item
 * @param {{retries?: number, backoffMs?: number}} [opts]
 * @returns {Promise<'correct'|'incorrect'|'abstained'>}
 */
export async function judge(llm, item, opts = {}) {
  const retries = resolveRetries(opts.retries);
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

// A trap question has no gold answer, so there is nothing to compare against —
// the only thing worth grading is whether the candidate asserted a specific
// fact or declined.
//
// A SEPARATE prompt rather than reusing JUDGE_SYSTEM, because the two ask
// different questions. The gold-anchored judge grades a candidate against a
// known answer; on a trap there is none, and inviting a comparison against
// something that does not exist is how a judge starts inventing a standard.
// The labels also differ in kind: `abstained` on an answerable question is a
// failure to answer, while declining a trap is the correct outcome.
//
// Both prompts name the mixed decline-then-answer case explicitly, and for the
// same reason — a candidate that declines in its first clause and supplies a
// figure in the next is the exact fabrication being measured, and neither path
// may read it as a refusal.
export const TRAP_JUDGE_SYSTEM =
  'You are told whether a candidate answer commits to a specific factual claim. ' +
  'Reply with exactly one word: ASSERTED if the candidate states a specific ' +
  'fact, figure or recommendation answering the question, or DECLINED if it ' +
  'says it does not know or that the information is unavailable. If the ' +
  'candidate declines AND THEN still supplies a specific answer, that is ' +
  'ASSERTED. Reply with the single word only.';

/**
 * ASSERTED and DECLINED do not contain each other as substrings, so the
 * ordering hazard that forces INCORRECT to be tested before CORRECT in
 * parseVerdict does not arise here. Tested for anyway — that bug is cheap to
 * reintroduce and expensive to notice.
 * @returns {'invented'|'declined'|null}
 */
export function parseTrapVerdict(raw) {
  if (!raw) return null;
  const t = raw.toUpperCase();
  // Both labels in one reply is a judge describing its reasoning rather than
  // answering. Order-of-testing would pick a winner arbitrarily, and here that
  // arbitrary winner has a direction: ASSERTED is tested first, so every
  // ambiguous reply would be recorded as an invention.
  if (t.includes('ASSERTED') && t.includes('DECLINED')) return null;
  const m = TRAP_LABEL.exec(t);
  if (!m) return null;
  // Negation only counts in the clause before the label — see NEGATED.
  if (NEGATED.test(clauseBefore(raw, m.index))) return null;
  return m[1] === 'ASSERTED' ? 'invented' : 'declined';
}

/**
 * @param {{complete(system: string, user: string): Promise<string>}} llm
 * @param {{question: string, candidate: string}} item
 * @param {{retries?: number, backoffMs?: number}} [opts]
 * @returns {Promise<'invented'|'declined'>}
 */
export async function judgeTrap(llm, item, opts = {}) {
  const retries = resolveRetries(opts.retries);
  const backoffMs = opts.backoffMs ?? 1000;

  const user =
    `Question: ${item.question}\n` +
    `Candidate answer: ${item.candidate}\n\n` +
    `Did the candidate ASSERT an answer, or DECLINE?`;

  let last = '';
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      last = await llm.complete(TRAP_JUDGE_SYSTEM, user);
      const verdict = parseTrapVerdict(last);
      if (verdict) return verdict;
    } catch (e) {
      last = e.message;
    }
    if (attempt < retries - 1) await sleep(backoffMs * 2 ** attempt);
  }
  throw new Error(`judgeTrap: could not parse a trap verdict after ${retries} attempts. Last response: ${last}`);
}
