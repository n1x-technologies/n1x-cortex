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
cd toolkit && npm run build && cd ../bench && npm install

# Stage A — retrieval quality and cost. No API key, no network.
node run.mjs --stage a --corpus fixtures
node run.mjs --stage a --corpus /path/to/vault --questions /path/to/questions.jsonl

# Stage B — adds judged answers. Needs a reachable model endpoint.
node run.mjs --stage ab --corpus /path/to/vault --questions /path/to/questions.jsonl \
  --model anthropic:claude-sonnet-5
```

## Systems compared

| System | What it represents | Stage |
|---|---|---|
| `full-context` | The whole corpus in the prompt, in filesystem order. Cost floor; does not rank. | A + B |
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
having it: the cost floor a real corpus is measured against.

Latency figures are wall-clock milliseconds on this fixture on a single
developer machine; they are not a portability claim and are not gated.

**This table detects regressions. It does not compare systems.** The fixture
saturates: every Cortex variant and `naive-rag` score recall@5 = 1.000
because the gold note ranks first under every retrieval strategy on a
12-note corpus. No cross-system claim (e.g. "cortex beats naive-rag") is made
from these numbers, and none should be inferred from them. A corpus large
enough to separate these systems has not been run yet.

Two more caveats specific to this fixture:

- **`naive-rag`'s cost-matched `TOP_K` is calibrated to 12** on this corpus,
  which has exactly 12 single-chunk notes (`lib/systems/naive-rag.mjs`), so
  cost-matching here drives it to retrieve the entire corpus. Its real
  cutoff behaviour — retrieving a bounded top-k out of many more chunks —
  only shows up on a larger corpus.
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
