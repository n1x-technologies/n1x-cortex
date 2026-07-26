// Exports a stratified sample for a human to label by hand. Judge-versus-human
// agreement is published alongside the numbers; below 90% agreement the judge
// prompt is revised before anything is published.
//
// Stratified, not first-n: sampling only the easy correct cases would inflate
// apparent agreement. Deterministic ordering, so re-running does not reshuffle
// work a human already did.
//
// Samples exactly ONE system's records per call (the `systemName` argument,
// defaulting to whichever system happens to be first in `results.perSystem`'s
// insertion order). The judge-human agreement figure computed from the
// resulting file therefore describes that one system only — it is NOT a
// judge-quality figure for the whole run, and both the heading and the body
// text below say so explicitly so the caveat survives being read out of
// context (e.g. pasted into a report without the surrounding markdown).

// Five strata, not three. Without the two trap verdicts a 30-item sample is
// drawn entirely from the answerable side, and the trap judge — the newer and
// less validated of the two judge paths — would never be checked by a human.
const VERDICTS = ['correct', 'incorrect', 'abstained', 'declined', 'invented'];

export function renderSpotCheck(results, questions, sampleSize = 30, systemName) {
  const byId = new Map(questions.map(q => [q.id, q]));
  const name = systemName ?? Object.keys(results.perSystem)[0];
  const system = results.perSystem[name];
  if (!system) {
    throw new Error(
      `renderSpotCheck: no system named "${name}" in this run ` +
        `(have: ${Object.keys(results.perSystem).join(', ') || 'none'})`,
    );
  }
  const records = system.records;

  // Round-robin across verdict classes so every class is represented. A verdict
  // outside the five known classes gets its own bucket rather than being
  // dropped: an unrecognised label is the single most interesting thing a human
  // could be shown, and silently excluding it from the sample would hide the
  // one case where the judge did something nobody anticipated.
  const known = new Set(VERDICTS);
  const buckets = [
    ...VERDICTS.map(v => records.filter(r => r.verdict === v)),
    records.filter(r => !known.has(r.verdict)),
  ];
  const picked = [];
  for (let i = 0; picked.length < Math.min(sampleSize, records.length); i++) {
    let progressed = false;
    for (const bucket of buckets) {
      if (i < bucket.length && picked.length < sampleSize) {
        picked.push(bucket[i]);
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  const lines = [
    `# Judge spot-check — ${name}`,
    '',
    `${picked.length} of ${records.length} records, stratified across verdict classes.`,
    `Judge-human agreement computed from this file measures the \`${name}\` system's ` +
      'records only — it does not represent judge quality on any other system in the run.',
    'Fill in each `human:` line with correct / incorrect / abstained for an answerable ' +
      'question, or declined / invented for a trap, then compute agreement.',
    '',
  ];

  for (const rec of picked) {
    const q = byId.get(rec.id);
    if (!q) {
      throw new Error(
        `renderSpotCheck: record "${rec.id}" from system "${name}" has no matching ` +
          'question — the results and the question set are from different runs',
      );
    }
    const isTrap = q.answerable === false;
    lines.push(
      `### ${rec.id}`,
      '',
      `**Question:** ${q.question}`,
      // A trap has no gold answer. Showing the near-miss notes instead is not
      // a cosmetic swap: the question looks answerable, and those notes are
      // what the system was actually shown, so they are the only basis on
      // which a human can judge whether declining was the right call.
      isTrap
        ? `**Near-miss notes:** ${q.nearMissPaths.join(', ')}`
        : `**Gold answer:** ${q.goldAnswer}`,
      `**Candidate:** ${rec.candidate}`,
      '',
      ...(isTrap
        ? ['_Trap: the corpus does not answer this. Declining is correct; supplying a specific answer is an invention._', '']
        : []),
      `judge: \`${rec.verdict}\``,
      'human: ______',
      '',
    );
  }

  return lines.join('\n');
}
