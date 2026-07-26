// Stage B: generate an answer from each system's payload with ONE answering
// model, then judge it against the gold answer.
//
// The closed-book system doubles as the contamination control. Any question it
// answers correctly was already known from pretraining; headline metrics are
// reported on the uncontaminated subset, because contaminated questions
// compress the difference between every system and flatter all of them.
//
// Fabrication rate is `incorrect / scored`, where `scored` is EVERY question
// the system was scored on for this run — abstentions are included in that
// denominator and are NEVER counted in the numerator. A system that abstains
// instead of guessing should score a LOWER fabrication rate: that is exactly
// what the grounding claim asserts, and it is what makes this number mean "how
// often did this system make something up when asked", not "how often did it
// make something up on the subset of questions it chose to answer". This
// arithmetic is load-bearing — the entire grounding claim rests on it.
import { countTokens } from './tokenizer.mjs';
import { percentile } from './metrics.mjs';
import { answer } from './answer.mjs';
import { judge, judgeTrap } from './judge.mjs';

/**
 * @param {object} p
 * @param {{[name: string]: number}} [p.subsample] cap on ANSWERABLE questions
 *   per system. full-context sends the whole corpus per question and would
 *   otherwise dominate the run's cost. The cap is deterministic (leading
 *   slice), so every capped system sees the same questions. A supplied cap
 *   must be a positive integer — a falsy-but-present value like 0 is a
 *   deliberate "ask this system nothing", not "no cap", and is rejected
 *   rather than silently reinterpreted as uncapped. `closed-book` may never
 *   appear here: it is the contamination control, and subsampling it would
 *   measure contamination on a slice while questionCount/uncontaminatedCount
 *   stay computed against the full set, silently corrupting every
 *   uncontaminated headline metric.
 *
 *   Traps are NEVER subsampled — the cap applies to answerable questions only.
 *   A plain leading slice over the whole dataset drops them all, because traps
 *   are authored at the tail: on the CI fixture any cap below 16 asked
 *   full-context zero traps, so the reference system every other system is
 *   measured against reported `invented n/a` with no warning, in exactly the
 *   configuration meant for publication. Proportional stratification would
 *   only soften that — one system computing inventionRate over 3 traps and
 *   another over 4 puts two incomparable numbers in the same column. The
 *   column is only meaningful if every system faced the same traps, and traps
 *   are hand-authored and few, so exempting them costs little.
 * @returns {Promise<{perSystem: object, contaminatedIds: string[], questionCount: number, uncontaminatedCount: number}>}
 */
export async function runStageB({ systems, questions, ctx, llm, judgeLlm, subsample = {} }) {
  validateSubsample(subsample);

  const perSystem = {};

  for (const system of systems) {
    const records = [];
    const errors = [];
    const tokens = [];

    const cap = subsample[system.name];
    const asked = cap === undefined ? questions : capAnswerable(questions, cap);

    for (const q of asked) {
      try {
        const r = await system.run(q.question, ctx);
        const candidate = await answer(llm, q.question, r.promptPayload, {
          isClosedBook: !!system.closedBook,
          systemName: system.name,
        });
        // Same default as dataset.mjs's loader, restated so a question object
        // built inline is not misread as a trap.
        const answerable = q.answerable !== false;
        const verdict = answerable
          ? await judge(judgeLlm, {
              question: q.question,
              goldAnswer: q.goldAnswer,
              candidate,
            })
          : await judgeTrap(judgeLlm, { question: q.question, candidate });
        const questionTokens = countTokens(r.promptPayload) + r.retrievalTokens;
        records.push({ id: q.id, answerable, verdict, candidate, tokens: questionTokens });
        tokens.push(questionTokens);
      } catch (e) {
        errors.push({ id: q.id, message: e.message });
      }
    }

    perSystem[system.name] = { name: system.name, records, errors, tokens, asked: asked.length };
  }

  // Contamination: ANSWERABLE questions the closed-book control answered
  // correctly. A trap is excluded by construction — it has no corpus answer the
  // model could already have known, and knowing the fact from the world does
  // not make the question answerable FROM THE CORPUS, which is the only thing
  // being measured. Including traps would dilute the control without adding
  // information.
  const control = perSystem['closed-book'];
  const contaminatedIds = control
    ? control.records.filter(r => r.answerable && r.verdict === 'correct').map(r => r.id)
    : [];
  const contaminated = new Set(contaminatedIds);

  const answerableCount = questions.filter(q => q.answerable !== false).length;

  for (const s of Object.values(perSystem)) {
    const all = s.records.filter(r => r.answerable);
    const traps = s.records.filter(r => !r.answerable);
    const clean = all.filter(r => !contaminated.has(r.id));

    perSystem[s.name] = {
      name: s.name,
      accuracy: rate(all, 'correct'),
      accuracyUncontaminated: rate(clean, 'correct'),
      abstentionRate: rate(all, 'abstained'),
      fabricationRate: rate(all, 'incorrect'),
      fabricationRateUncontaminated: rate(clean, 'incorrect'),
      // Trap questions only, and ALWAYS read next to abstentionRate. A system
      // that answers "I don't know" to everything scores a perfect
      // inventionRate and fails every answerable question; one that always
      // asserts does the reverse. Either number alone is gameable — the pair
      // is the measurement. null when the dataset had no traps: "no traps were
      // asked" must never print as "invented nothing".
      inventionRate: traps.length ? rate(traps, 'invented') : null,
      // percentile([]) already returns 0, not NaN (bench/lib/metrics.mjs), so
      // this guard isn't defusing a NaN that would otherwise appear. It exists
      // to stop a silent 0 from reading as "measured zero cost" when there was
      // no data to measure at all; null is unambiguous and still JSON-safe,
      // and it must always be read next to `scored`, which says why.
      medianTokens: s.tokens.length ? Math.round(percentile(s.tokens, 0.5)) : null,
      asked: s.asked,
      errors: s.errors,
      scored: all.length,
      scoredUncontaminated: clean.length,
      trapScored: traps.length,
      // The FULL record list, both kinds — the per-question audit trail must
      // not lose the traps just because the rates above are split.
      records: s.records,
    };
  }

  return {
    perSystem,
    contaminatedIds,
    questionCount: questions.length,
    answerableCount,
    uncontaminatedCount: answerableCount - contaminatedIds.length,
  };
}

function validateSubsample(subsample) {
  if (Object.prototype.hasOwnProperty.call(subsample, 'closed-book')) {
    throw new Error(
      "subsample must not include an entry for 'closed-book': it is the " +
        'contamination control and must run over every question, or ' +
        'contaminatedIds/uncontaminatedCount would be measured against a ' +
        'slice while reported against the full question set.',
    );
  }
  for (const [name, cap] of Object.entries(subsample)) {
    if (!Number.isInteger(cap) || cap <= 0) {
      throw new Error(
        `subsample["${name}"] must be a positive integer, got ${JSON.stringify(cap)}`,
      );
    }
  }
}

/**
 * Leading slice of the ANSWERABLE questions, keeping every trap. Preserves the
 * dataset's original order so the run stays deterministic and the records read
 * in file order. See the subsample docstring on runStageB for why traps are
 * exempt rather than proportionally sampled.
 */
function capAnswerable(questions, cap) {
  let kept = 0;
  return questions.filter(q => (q.answerable === false ? true : kept++ < cap));
}

function rate(records, verdict) {
  if (!records.length) return 0;
  return round(records.filter(r => r.verdict === verdict).length / records.length);
}

const round = n => Math.round(n * 10000) / 10000;
