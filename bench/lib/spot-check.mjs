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

const VERDICTS = ['correct', 'incorrect', 'abstained'];

export function renderSpotCheck(results, questions, sampleSize = 30, systemName) {
  const byId = new Map(questions.map(q => [q.id, q]));
  const name = systemName ?? Object.keys(results.perSystem)[0];
  const records = results.perSystem[name].records;

  // Round-robin across verdict classes so every class is represented.
  const buckets = VERDICTS.map(v => records.filter(r => r.verdict === v));
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
    'Fill in each `human:` line with correct / incorrect / abstained, then compute agreement.',
    '',
  ];

  for (const rec of picked) {
    const q = byId.get(rec.id);
    lines.push(
      `### ${rec.id}`,
      '',
      `**Question:** ${q.question}`,
      `**Gold answer:** ${q.goldAnswer}`,
      `**Candidate:** ${rec.candidate}`,
      '',
      `judge: \`${rec.verdict}\``,
      'human: ______',
      '',
    );
  }

  return lines.join('\n');
}
