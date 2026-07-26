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
into three classes: correct, incorrect, abstained. Fabrication rate is
incorrect answers as a share of everything the system was scored on —
abstentions sit in the denominator and never in the numerator, so abstaining
instead of guessing correctly lowers the rate. Token counts come from a real
BPE tokenizer (`lib/tokenizer.mjs`), never a `chars / 4` estimate.

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
Questions: 15, one gold note each. This fixture exists to catch regressions
in CI, not to compare systems — see the caveats below the table. Numbers are
taken from the committed `bench/fixtures/baseline.json` (recall@5,
medianTokens) and a matching run of `bench/out/results.json` (MRR, nDCG@10,
latency, error counts), reproduced by running the commands above.

| System | recall@5 | MRR | nDCG@10 | tokens/query (median) | latency (median) | errors |
|---|---|---|---|---|---|---|
| `cortex` | 1.000 | 1.000 | 1.000 | 982 | 2ms | 0/15 |
| `cortex-lexical` | 1.000 | 1.000 | 1.000 | 714 | 1ms | 0/15 |
| `cortex-semantic` | 1.000 | 0.967 | 0.975 | 1077 | 1ms | 0/15 |
| `naive-rag` | 1.000 | 0.967 | 0.975 | 1081 | 0ms | 0/15 |
| `full-context` | n/a | n/a | n/a | 1033 | 0ms | 0/15 |

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

Three more caveats specific to this fixture:

- **`naive-rag`'s cost-matched `TOP_K` is calibrated to 12** on this corpus,
  which has exactly 12 single-chunk notes (`lib/systems/naive-rag.mjs`), so
  cost-matching here drives it to retrieve the entire corpus. Its real
  cutoff behaviour — retrieving a bounded top-k out of many more chunks —
  only shows up on a larger corpus.
- **The cost column saturates for the same reason recall does.** The whole
  12-note corpus is 1033 tokens, and `cortex`'s median payload of 982 tokens
  is 95.1% of that — it is citing 8-12 of 12 notes per question, because a
  12-note corpus barely gives a retriever room to leave anything out. Two
  systems (`cortex-semantic` at 1077, `naive-rag` at 1081) cost MORE than
  `full-context`'s 1033. No cost comparison — "cortex is cheaper than
  full-context", "cortex is cheaper than naive-rag" — can be drawn from this
  fixture; a corpus where a retriever can actually leave most of the corpus
  out has not been run yet.
- Error counts are 0/15 for every system on this run. Stage A's per-system
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
fabrication rate, tokens/query) and `out/spot-check.md` — a stratified
30-item export (correct / incorrect / abstained, evenly sampled) for a human
to label by hand.

**Judge-human agreement has not been measured.** No human has labelled a
spot-check sample yet. The project's own rule (`lib/spot-check.mjs`) is that
below 90% judge-human agreement, no accuracy or fabrication number gets
published at all — so there is no percentage to report here, placeholder or
otherwise, until that labelling happens and clears the bar.

## Honest boundary

- **Stage A averages only over questions that succeeded.** A system that
  errors on its ten hardest questions and is perfect on the remaining five
  scores better than an honest system that answered all fifteen. Per-system
  error counts are printed beside every metric in the table above for
  exactly this reason.
- **The CI fixture saturates.** All Cortex variants and `naive-rag` hit
  recall@5 = 1.000 on its 12-note corpus. It detects regressions; it cannot
  and does not show a difference between systems.
- **The cost column saturates too, for the same reason.** The whole 12-note
  corpus is 1033 tokens; `cortex`'s median payload is 982 tokens — 95.1% of
  the entire corpus, 8-12 of 12 notes cited per question. Two systems
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
- **Abstention is decided by the judge model, not by a local pattern.** It
  used to be a `^`-anchored regex over a closed list of phrasings, on the
  argument that the answering prompt fixes those phrasings. An earlier version
  of this section called the resulting error "a one-directional bias that can
  only inflate fabrication rate, never deflate it". **That was false**, and it
  is worth stating plainly because it was the load-bearing reassurance for the
  headline metric.

  Because the pattern was anchored to the *prefix*, a reply that declined and
  then answered anyway — *"I don't know. It is 42."* — matched and was recorded
  as a clean abstention with no model call, leaving the fabrication numerator
  entirely. A system answering that way to every question fabricates on 100% of
  them and publishes `fabricate 0.000`. The same short-circuit let a
  `closed-book` answer that hedged before answering escape the contamination
  control, so a question the model provably knew from pretraining counted as
  uncontaminated and `accuracyUncontaminated` could read 1.000 over a fully
  contaminated set.

  The third label now lives in the judge prompt, with the mixed case named
  explicitly: a candidate that declines and then supplies an answer is graded
  on the answer it gave. This costs one model call per abstention that
  previously short-circuited. It also fixes the *other* direction the old
  paragraph described — a paraphrased refusal is now read as an abstention
  rather than counted as a fabrication.

  The remaining control is unchanged: judge-human spot-checking
  (`out/spot-check.md`, see above), and below 90% agreement no accuracy or
  fabrication number is published at all.
- **Stage B is unmeasured.** No answer-quality table, no fabrication rate,
  no judge-human agreement figure exists yet. See Stage B above.
- **Numbers are corpus-dependent.** Run it on your own vault; do not carry
  these figures over to a different corpus.

## Regression gate

`node run.mjs --stage a --corpus fixtures --gate 1` runs on every pull request
against the committed `bench/fixtures/ci-vault` fixture and fails when
recall@5 drops more than 2 points, median tokens rise more than 10%, or any
system errors. Re-baselining after an intentional change requires an
explicit flag:

```bash
node run.mjs --stage a --corpus fixtures --update-baseline 1
```
