#!/usr/bin/env node
// Computes judge-human agreement from a hand-labelled out/spot-check.md.
//
//   node bench/scripts/judge-agreement.mjs [path/to/spot-check.md]
//
// The project rule (bench/lib/spot-check.mjs) is that below 90% agreement no
// accuracy or fabrication number gets published at all. This script decides
// that, and prints the disagreements so a failure says WHERE the judge and the
// human parted rather than only that they did.
//
// It reports a confusion matrix rather than a single percentage on purpose. An
// aggregate hides the thing that matters: a judge that is 93% overall but wrong
// on every abstention has not earned the right to publish a fabrication rate,
// because abstention is exactly what separates the numerator from the
// denominator there. The same holds for declined/invented on traps.
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(process.argv[2] ?? join(here, '../out/spot-check.md'));

const VALID = ['correct', 'incorrect', 'abstained', 'declined', 'invented'];
const BAR = 0.9;

let md;
try {
  md = readFileSync(path, 'utf8');
} catch {
  console.error(`no spot-check at ${path}\nRun: node bench/run.mjs --stage ab --corpus ... --model ...`);
  process.exit(1);
}

// Records are `### <id>` blocks each carrying a judge line and a human line.
const blocks = md.split(/^### /m).slice(1);
const rows = [];
const malformed = [];

for (const b of blocks) {
  const id = b.split('\n')[0].trim();
  const judge = /^judge: `(\w+)`/m.exec(b)?.[1];
  // Normalised before matching. The `judge:` line one row above renders its
  // label in backticks, so a labeller copying that format writes `correct`
  // rather than correct — which is the natural thing to do and was rejected as
  // a typo on all 19 records the first time this ran. Trailing punctuation and
  // case are stripped for the same reason: the point is to capture a human's
  // judgement, not to test their formatting.
  const humanRaw = /^human:\s*(.*)$/m.exec(b)?.[1]
    ?.trim()
    .toLowerCase()
    .replace(/[`'"*_]/g, '')
    .replace(/[.,;]+$/, '')
    .trim();

  if (!judge) { malformed.push(`${id}: no judge line`); continue; }
  if (!humanRaw || /^_+$/.test(humanRaw)) continue;      // not labelled yet
  if (!VALID.includes(humanRaw)) {
    // Loud, not skipped: a typo silently dropped from the denominator would
    // inflate agreement, which is the one direction that must never happen
    // quietly.
    malformed.push(`${id}: human label "${humanRaw}" is not one of ${VALID.join(', ')}`);
    continue;
  }
  rows.push({ id, judge, human: humanRaw });
}

const total = blocks.length;
if (malformed.length) {
  console.error('MALFORMED LABELS — fix these before trusting any number below:');
  for (const m of malformed) console.error(`  ${m}`);
  console.error('');
}

if (!rows.length) {
  console.error(`nothing labelled yet: 0 of ${total} records in ${path} have a human label.`);
  console.error('Fill each `human:` line with correct / incorrect / abstained (answerable)');
  console.error('or declined / invented (trap), then re-run.');
  process.exit(1);
}

const agreed = rows.filter(r => r.judge === r.human).length;
const rate = agreed / rows.length;

// "(18/19 labelled, 19 exported)" read as "18 of 19 got labelled" when it
// meant "18 of 19 labelled records agreed" — the two are different facts and
// the wrong one is reassuring. Spelled out.
console.log(`\njudge-human agreement: ${(rate * 100).toFixed(1)}%`);
console.log(`  ${agreed} of ${rows.length} labelled records agreed (${total} exported, ${total - rows.length} unlabelled)\n`);

// Per-class, because an aggregate can hide a class the judge always gets wrong.
console.log('by judge label:');
for (const label of VALID) {
  const of = rows.filter(r => r.judge === label);
  if (!of.length) continue;
  const ok = of.filter(r => r.human === label).length;
  console.log(`  ${label.padEnd(10)} ${ok}/${of.length}  ${of.length ? ((ok / of.length) * 100).toFixed(0) + '%' : ''}`);
}

const disagreements = rows.filter(r => r.judge !== r.human);
if (disagreements.length) {
  console.log('\ndisagreements (judge -> human):');
  for (const d of disagreements) console.log(`  ${d.id.padEnd(8)} ${d.judge} -> ${d.human}`);
}

if (rows.length < total) {
  console.log(`\nNOTE: ${total - rows.length} of ${total} exported records are still unlabelled.`);
  console.log('Agreement over a partial sample is not the published figure — label them all.');
}

console.log(
  rate >= BAR
    ? `\nPASS: at or above the ${BAR * 100}% bar. Accuracy and fabrication numbers may be published, ` +
      'stating this figure and the sample size beside them.'
    : `\nFAIL: below the ${BAR * 100}% bar. Revise the judge prompt and re-run; ` +
      'no accuracy or fabrication number is publishable until this clears.',
);
process.exit(rate >= BAR ? 0 : 1);
