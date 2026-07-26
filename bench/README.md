# Benchmarks

What Cortex costs and what it buys, measured against baselines chosen to be
hard to beat rather than easy.

**Status: only the CI fixture has been run, and its 12-note corpus saturates
every system under test — see below.** No public-corpus run exists yet, and
Stage B (judged answer quality) has never been run against a live model. This
file states exactly that, rather than filling the gaps with numbers from
elsewhere.

## Method

Every system under test implements one contract: given a question, return the
exact text it would place in a prompt, plus the paths it cites. Stage A
measures that contract directly — retrieval quality and token/latency cost,
no model call, no network. Stage B adds a single answering model that answers
from that text, with the same system prompt for every system, so the
answering model is a controlled variable and any difference is attributable
to retrieval. Answers are graded by a judge model given the **gold answer**,
into three classes: correct, incorrect, abstained. (Trap questions are graded
on a separate two-class track — see below.) Fabrication rate is
incorrect answers as a share of everything the system was scored on —
abstentions sit in the denominator and never in the numerator, so abstaining
instead of guessing correctly lowers the rate. Token counts come from a real
BPE tokenizer (`lib/tokenizer.mjs`), never a `chars / 4` estimate.

### Trap questions

A fabrication rate built only from answerable questions measures getting a
*present* fact wrong. It cannot see the failure people actually fear: a
confident answer to something the corpus does not contain.

So the question set also carries **trap questions** — declared with
`"answerable": false`, no gold answer, and a required `nearMissPaths` naming
the notes that make the question *look* answerable. They are near-miss traps
by construction: the corpus holds topically adjacent notes, and none of them
holds the answer. Membership is always declared, never inferred from the
answer text.

Traps are scored on a separate track, because the three labels invert meaning
across the two kinds: on an answerable question abstaining is a failure, on a
trap it is the correct response. Averaging them would be meaningless.

- **Stage A** scores traps for **cost only**. A trap has no gold document, so
  ranking metrics have no defined value for it — but its retrieval is real and
  its tokens are real. What Stage A does measure is `near-miss` (below).
- **Stage B** routes traps to a second judge prompt that asks a different
  question: did the candidate *commit to a specific claim* (`invented`) or say
  it does not know (`declined`)? This judge is never the local abstention
  pattern, deliberately — see the honest boundary.

`inventionRate` and `fabricationRate` are never merged into one number, and
`inventionRate` is always published next to `abstentionRate`, because either
alone is gameable: a system that answers "I don't know" to everything scores a
perfect invention rate and fails every answerable question.

Run it:

```bash
cd toolkit && npm ci && npm run build && cd ../bench && npm install

# Stage A — retrieval quality and cost. No API key, no network.
node run.mjs --stage a --corpus fixtures
node run.mjs --stage a --corpus /path/to/vault --questions /path/to/questions.jsonl

# Stage B — adds judged answers. Needs a reachable model endpoint.
node run.mjs --stage ab --corpus /path/to/vault --questions /path/to/questions.jsonl \
  --model anthropic:claude-sonnet-5
```

Any `--corpus` other than `fixtures` builds a real, on-device embedding store
via `toolkit/dist/semantic/embedder.js`, which requires `@huggingface/transformers`
— an OPTIONAL peer of `toolkit` (`toolkit/package.json`'s `peerDependenciesMeta`).
`npm ci` above already installs it, because `toolkit` also lists it as a
devDependency for its own build/test — but that is silent unless stated here,
and it is the only path (a real corpus, not the CI fixture) that could ever
produce a publishable number.

## Systems compared

| System | What it represents | Stage |
|---|---|---|
| `full-context` | The whole corpus in the prompt, in filesystem order. The reference cost a retriever must beat; does not rank. | A + B |
| `cortex` | Hybrid lexical + semantic retrieval fused with RRF. | A + B |
| `cortex-lexical` / `cortex-semantic` | Ablations isolating each retrieval signal. | A + B |
| `naive-rag` | Fixed ~512-token chunks, same embedding model as Cortex, cost-matched top-k. | A + B |
| `grep-agent` | A text-protocol ReAct loop that lists, greps and reads files — what an agent does without Cortex. | B only |
| `closed-book` | No context at all. A control, not a baseline. | B only |

`grep-agent` and `closed-book` run only under Stage B: their retrieval is
either LLM-driven or nonexistent, so neither has a meaningful offline
(no-model) retrieval metric, and forcing them through Stage A would print
rows that look like real measurements without being any (`bench/lib/system-list.mjs`).

## Stage A — retrieval quality and cost (CI fixture)

Corpus: `bench/fixtures/ci-vault` — 12 synthetic notes (a fictional coffee
roastery's process docs), each short enough to be a single retrieval chunk.
Questions: 19 — 15 answerable with one gold note each, plus 4 trap questions
the corpus cannot answer. This fixture exists to catch regressions in CI, not
to compare systems — see the caveats below the table. Numbers are taken from
the committed `bench/fixtures/baseline.json` (recall@5, near-miss,
medianTokens) and a matching run of `bench/out/results.json` (MRR, nDCG@10,
latency, error counts), reproduced by running the commands above.

| System | recall@5 | MRR | nDCG@10 | near-miss | tokens/query (median) | latency (median) | errors |
|---|---|---|---|---|---|---|---|
| `cortex` | 1.000 | 1.000 | 1.000 | 1.000 | 809 | 2ms | 0/19 |
| `cortex-lexical` | 1.000 | 1.000 | 1.000 | 1.000 | 714 | 1ms | 0/19 |
| `cortex-semantic` | 1.000 | 0.967 | 0.975 | 1.000 | 1077 | 1ms | 0/19 |
| `naive-rag` | 1.000 | 0.967 | 0.975 | 1.000 | 1081 | 0ms | 0/19 |
| `full-context` | n/a | n/a | n/a | n/a | 1033 | 0ms | 0/19 |

**near-miss** is the fraction of trap questions where the system retrieved at
least one of the tempting-but-insufficient notes. It is binary per trap —
retrieving one near-miss note counts the same as retrieving all of them,
because the only question it asks is whether the system was *exposed to the
temptation*. It exists to be read next to Stage B's `invented` column: a
system with low invention and a low near-miss hit rate was never tempted, not
virtuous. Ranking metrics are computed over the 15 answerable questions,
near-miss over the 4 traps, and cost over all 19; every run prints the three
denominators as `n 15/4/19` so a rate is never read against the wrong one.

`full-context`'s recall@5/MRR/nDCG@10 are **n/a**, not zero or omitted:
`full-context` emits the whole corpus in filesystem order rather than a
ranking, so recall@5/MRR/nDCG@10 would truncate an unranked list and describe
directory order, not retrieval quality (`ranks = false` in
`lib/systems/full-context.mjs`). It is included anyway for its token
figure — 1033 tokens/query on this 12-note corpus — which is the point of
having it: the reference cost a real retriever must beat.

Latency figures are wall-clock milliseconds on this fixture on a single
developer machine; they are not a portability claim and are not gated.

**This table detects regressions. It does not compare systems.** The fixture
saturates: every Cortex variant and `naive-rag` score recall@5 = 1.000
because the gold note ranks first under every retrieval strategy on a
12-note corpus. No cross-system claim (e.g. "cortex beats naive-rag") is made
from these numbers, and none should be inferred from them. A corpus large
enough to separate these systems has not been run yet.

**The near-miss column saturates too**, and that is worth stating plainly
because an earlier version of this metric appeared not to. Every ranking
system retrieves at least one near-miss note on all four traps, so all four
score 1.000. A previous implementation averaged the *fraction* of near-miss
notes retrieved per trap and produced an apparent ordering (`cortex` 0.875,
`cortex-semantic` 1.000) — that ordering was an artifact of measuring
coverage while the metric's stated purpose was temptation, and it made
shipped Cortex look worse than its own ablation over a single note on a
single trap. Four traps on a 12-note corpus cannot separate these systems
either.

Three more caveats specific to this fixture:

- **`naive-rag`'s cost-matched `TOP_K` is calibrated to 12** on this corpus,
  which has exactly 12 single-chunk notes (`lib/systems/naive-rag.mjs`), so
  cost-matching here drives it to retrieve the entire corpus. Its real
  cutoff behaviour — retrieving a bounded top-k out of many more chunks —
  only shows up on a larger corpus.
- **The cost column saturates for the same reason recall does.** The whole
  12-note corpus is 1033 tokens, and `cortex`'s median payload of 809 tokens
  is 78.3% of that — it is citing most of the corpus per question, because a
  12-note corpus barely gives a retriever room to leave anything out. Two
  systems (`cortex-semantic` at 1077, `naive-rag` at 1081) cost MORE than
  `full-context`'s 1033. No cost comparison — "cortex is cheaper than
  full-context", "cortex is cheaper than naive-rag" — can be drawn from this
  fixture; a corpus where a retriever can actually leave most of the corpus
  out has not been run yet.
- **The median cost figure moves with the question set, not only with the
  system.** It is a median over all 19 questions, traps included, so adding
  or removing questions shifts it on its own: adding the four traps moved
  `cortex` from 982 to 809 with no code change at all. The baseline therefore
  records the three denominators alongside the metrics, and the gate reports
  a changed question set as a dataset change rather than as a cost regression.
- Error counts are 0/19 for every system on this run. Stage A's per-system
  averages are computed only over the questions a system answered without
  error, so a system that errors on its hardest questions and is perfect on
  the rest would score *better* than an honest system that answered
  everything. That is why error counts are printed beside every metric,
  even when — as here — they are all zero.

## Stage B — answer quality

**Not run against a live model.** Task 15 verified only the runner's
no-`--model` guard; every Stage B unit test uses stubbed LLM responses, and no
local model endpoint has been reachable during this build. No Stage B table
is published. The method below is implemented and tested — it is not
theoretical — it has simply not been pointed at a real corpus and a real
model yet.

```bash
node run.mjs --stage ab --corpus /path/to/vault --questions /path/to/questions.jsonl \
  --model anthropic:claude-sonnet-5
```

This writes `out/results-stage-b.json` (per-system accuracy, abstention rate,
fabrication rate, invention rate, tokens/query) and `out/spot-check.md` — a
stratified 30-item export for a human to label by hand. The sample is drawn
across all five verdict classes — correct / incorrect / abstained for
answerable questions, declined / invented for traps — so the trap judge, the
newer and less validated of the two judge paths, is actually checked by the
human rather than crowded out by the answerable side.

Every rate is printed beside the denominator it was computed over
(`n <answerable>/<uncontaminated>/<traps>`), and a rate with an empty
population prints `n/a`, never `0.000`: a system that errored on every
question must not publish the best possible fabrication score.

**Judge-human agreement has not been measured.** No human has labelled a
spot-check sample yet. The project's own rule (`lib/spot-check.mjs`) is that
below 90% judge-human agreement, no accuracy or fabrication number gets
published at all — so there is no percentage to report here, placeholder or
otherwise, until that labelling happens and clears the bar.

## Honest boundary

- **Stage A averages only over questions that succeeded.** A system that
  errors on its ten hardest questions and is perfect on the remaining five
  scores better than an honest system that answered all nineteen. Per-system
  error counts are printed beside every metric in the table above for
  exactly this reason.
- **The CI fixture saturates.** All Cortex variants and `naive-rag` hit
  recall@5 = 1.000 on its 12-note corpus. It detects regressions; it cannot
  and does not show a difference between systems.
- **The cost column saturates too, for the same reason.** The whole 12-note
  corpus is 1033 tokens; `cortex`'s median payload is 809 tokens — 78.3% of
  the entire corpus, most of it cited per question. Two systems
  (`cortex-semantic`, `naive-rag`) cost MORE than `full-context` on this
  fixture. No cost claim ("cortex costs less than full-context or than
  naive-rag") can be drawn from this fixture either; a corpus large enough
  for a retriever to actually leave most of it out has not been run yet.
- **`naive-rag`'s cost-matched `TOP_K` is calibrated to 12** on this fixture,
  which happens to have exactly 12 single-chunk notes, so cost-matching
  drives it to retrieve the whole corpus here. Real cutoff behaviour only
  appears on a larger corpus.
- **`grep-agent` credits recall for every path its `GREP` action matched**,
  whether or not the agent ever issued a `READ` on that path. That is
  generous to this baseline relative to an agent judged only on what it
  actually consumed — deliberate, so the baseline is built strong on
  purpose, but it inflates `grep-agent`'s apparent recall and must be read
  with that in mind.
- **`grep-agent`'s `GREP` action returns only the FIRST matching line per
  file**, not every matching line (`executeTool`'s `.find(...)` in
  `lib/systems/grep-agent.mjs`). This cuts the other way from the recall
  inflation above: a distinctive term that appears once near the top of a
  long file is easy for the agent to see and act on; the same term buried
  after an earlier, unrelated match on the same line prefix is invisible to
  it until it reads the whole file. This caps what the strongest baseline
  can see per grep and is a real limitation, not a tuning choice made to
  flatter it.
- **`grep-agent` is a text-protocol ReAct loop**, because the toolkit's LLM
  client exposes only single-turn completion with no native tool-calling
  API. A native function-calling agent would likely score somewhat higher.
  Its cost figure includes every turn of the loop, not just the final
  answer.
- **`full-context` does not rank.** It emits the whole corpus in filesystem
  order, so recall@5/MRR/nDCG@10 are reported as `n/a`, never as a number,
  for this system. Its token cost is the reason it is included.
- **Fabrication rate is incorrect answers ÷ every question the system was
  scored on**, with abstentions in the denominator and never in the
  numerator. A system that abstains instead of guessing correctly scores a
  *lower* fabrication rate under this definition. This is the number the
  grounding claim rests on, and it has not been measured yet (see Stage B
  above).
- **Abstention is detected by a fixed local pattern, not by the judge model**
  (`ABSTENTION` in `lib/judge.mjs`): a closed list of phrasings anchored to
  the start of the answer. A reply that abstains in different words — *"Based
  on the provided context, I don't know."* or *"There is no information in
  the notes about X."* — does not match, is sent to the judge, and is graded
  `incorrect` rather than `abstained`, inflating the fabrication rate. The
  intended control is judge-human spot-checking (`out/spot-check.md`, see
  above): a labeller reviewing the sample would catch a paraphrased refusal
  scored as a fabrication.
- **That local pattern has a second, opposite failure, and it is the one that
  blocks publication.** An earlier version of this file claimed the bias above
  "can only inflate fabrication rate, never deflate it". That claim is false.
  The pattern is anchored to the *start* of the answer, so a MIXED reply —
  one that declines in its first clause and then supplies a figure anyway,
  *"I don't know. It is 42."* — matches the prefix and is recorded as a clean
  abstention with no model call at all. It leaves the fabrication numerator
  entirely. A system that answers that way to everything fabricates on 100%
  of questions and publishes `fabricate 0.000`.

  The same short-circuit corrupts the contamination control: a `closed-book`
  answer that prefixes a decline is never graded `correct`, so a question the
  model provably knew from pretraining is counted as uncontaminated, and
  `accuracyUncontaminated` can read 1.000 over a fully contaminated set.

  This predates trap questions — it arrived with the two-stage engine — and
  is being fixed separately. **No Stage B `fabricationRate` or
  `*Uncontaminated` figure is publishable until that lands.** It is also
  exactly why the trap judge does not reuse this pattern: on the trap path a
  mixed answer is precisely the fabrication being measured, so that path
  always asks the model.
- **The trap judge's accuracy is unmeasured.** `inventionRate` comes from a
  model deciding whether a candidate committed to a claim. The prompt's
  load-bearing clauses are pinned by tests so they cannot be reworded or
  inverted unnoticed, but no offline test can show that the prompt makes a
  real model behave correctly, and no human has labelled a trap sample. The
  90% judge-human agreement bar applies to this path too, and has not been
  cleared for it.
- **Four traps cannot support a cross-system claim.** The near-miss column
  saturates at 1.000 for every ranking system on this fixture, and a
  four-question denominator has a resolution of 25 points. It detects
  regressions; it distinguishes nothing.
- **Stage B is unmeasured.** No answer-quality table, no fabrication rate,
  no judge-human agreement figure exists yet. See Stage B above.
- **Numbers are corpus-dependent.** Run it on your own vault; do not carry
  these figures over to a different corpus.

## Regression gate

`node run.mjs --stage a --corpus fixtures --gate 1` runs on every pull request
against the committed `bench/fixtures/ci-vault` fixture and fails when:

- recall@5 drops more than 2 points,
- the near-miss hit rate drops more than 2 points,
- median tokens rise more than 10%,
- the question set changed since the baseline (reported as a dataset change,
  and the cost check is skipped rather than blamed on the system),
- a system present in results is missing from the baseline, or reports a
  metric as missing/null/NaN that the baseline recorded as a number,
- or any system errors.

The 2-point near-miss threshold does not bind at this fixture size. That
metric is a mean of per-trap 0/1 values, so with four traps its resolution is
25 points: any single trap flipping from tempted to untempted fails the gate.
That is intended — on four traps there is no drop small enough to be noise —
and the threshold is there for a larger trap set.

Re-baselining after an intentional change requires an explicit flag:

```bash
node run.mjs --stage a --corpus fixtures --update-baseline 1
```
