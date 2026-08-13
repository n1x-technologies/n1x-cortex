// Tripwire for the contamination pilot's gold answers.
//
// A wrong gold answer is the one defect in a question set that nothing
// downstream can see: the judge treats it as truth, every system is scored
// against it, and no metric moves in a way that says "the answer is wrong".
// Structural validation (loadDataset) only proves the gold PATHS resolve —
// it says nothing about whether the ANSWER is in them.
//
// So each question names a distinctive phrase that must appear verbatim in one
// of its gold documents. This is a tripwire, not a classifier: it cannot tell
// a right answer from a plausible one, and a passing anchor is not proof the
// answer is complete. If it trips, re-read the document and ask whether the
// answer is still true at the pinned commit — do NOT edit the anchor until the
// regex passes, which converts a real signal into a silent one.
//
// The corpus is fetched, not vendored (bench/scripts/fetch-public-corpus.mjs),
// so this suite cannot run in CI. It skips loudly rather than silently: a
// skipped guard that looks like a passing one is the failure mode being
// avoided everywhere else in this benchmark.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../lib/dataset.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(here, '../corpora/k8s-docs');
const QUESTIONS = resolve(here, '../questions/pilot-k8s.jsonl');

// One phrase per question, taken from the passage the answer was written from.
const ANCHORS = {
  p1: 'default value is Always',
  p2: 'voluntary disruptions',
  p3: 'initialDelaySeconds',
  p4: 'ready to accept traffic',
  p5: 'storage asset in the external infrastructure',
  p6: 'stable network identity',
  p7: 'cluster-internal IP',
  p8: 'nodeSelector',
  p9: 'do not tolerate the taints',
  p10: 'default value is 25%',
  p11: 'without first creating a namespace',
  p12: 'does not provide secrecy or encryption',
  p13: 'kubelet',
  p14: 'continually tries and fails in a loop',
  p15: 'non-human account',
  p16: 'secondary containers',
  p17: "Node's IP at a static port",
  p18: 'Maintains network rules',
  p19: 'forcibly and immediately deletes the Pod',
  p20: 'not yet bound to a node',
};

const corpusPresent = existsSync(CORPUS);

if (!corpusPresent) {
  console.warn(
    `\n[pilot-questions] SKIPPED — corpus absent at ${CORPUS}.\n` +
      '  These gold answers are UNVERIFIED in this run. Fetch it with\n' +
      '  `node bench/scripts/fetch-public-corpus.mjs` to exercise the guard.\n',
  );
}

describe.skipIf(!corpusPresent)('pilot question set', () => {
  const questions = loadDataset(QUESTIONS, CORPUS);

  it('anchors every gold answer in one of its gold documents', () => {
    const unanchored = [];
    for (const q of questions) {
      const anchor = ANCHORS[q.id];
      // A question with no anchor is a gap in the guard, not a pass. Adding a
      // question without adding its anchor would otherwise widen the set while
      // silently narrowing what is checked.
      if (anchor === undefined) {
        unanchored.push(`${q.id}: no anchor declared`);
        continue;
      }
      const found = q.goldPaths.some(p => readFileSync(join(CORPUS, p), 'utf8').includes(anchor));
      if (!found) unanchored.push(`${q.id}: ${JSON.stringify(anchor)} is in none of ${q.goldPaths.join(', ')}`);
    }
    expect(unanchored).toEqual([]);
  });

  it('declares an anchor for every question and no orphans', () => {
    expect(Object.keys(ANCHORS).sort()).toEqual(questions.map(q => q.id).sort());
  });
});
