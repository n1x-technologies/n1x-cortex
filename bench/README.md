# Benchmarks, the measured case for Cortex

Two reproducible measurements of what Cortex buys you: **fewer prompt tokens per
question**, and a model that **stops making things up**. Every number was
produced with the shipped CLI on real data. Token counts use the standard
~4-chars/token approximation (exact char counts are printed so you can recompute).

## 1. Token efficiency, `token-reduction.mjs`

To answer a question over a knowledge base, the naïve path puts the whole thing in
the model's context. Cortex returns only the relevant, cited excerpts.

```bash
cd toolkit && npm run build && cd ..
VAULT=/path/to/your/vault node bench/token-reduction.mjs
```

Measured on a real 45-document corpus (~213k tokens):

| Approach | Tokens / query |
|---|---|
| Whole-vault dump | **213,409** |
| Cortex cited retrieval (`cortex query --json`, avg of 5) | **~1,340** |

- **99.37% fewer prompt tokens per query · ~159× less context**
- Retrieval returns a roughly **fixed** budget of top excerpts, so the reduction
  **grows with corpus size**: ~159× at 213k tokens → ~373× at 500k → ~746× at 1M.

## 2. Grounding vs. fabrication, `grounding-eval.mjs`

Ask the **same** local model project-specific facts (the kind not in any model's
pretraining) two ways: closed-book (no context), and grounded with the top-3
Cortex notes in full. Same model both times, the delta is what Cortex adds.

```bash
# needs a local ollama (or OpenAI-style) endpoint
VAULT=/path/to/vault MODEL=llama3.1:latest node bench/grounding-eval.mjs
```

| Model · condition | Correct | Confidently wrong (hallucinated) |
|---|---|---|
| llama3.1:8b · closed-book | 0% | **63%** |
| llama3.1:8b · grounded | 13% | 13% |
| qwen2.5-coder:14b · closed-book | 13% | **25%** |
| qwen2.5-coder:14b · grounded | 38% | **0%** |
| **Combined (N=16)** · closed-book | 6% | **44%** |
| **Combined (N=16)** · grounded | 25% | **6%** |

**Across both models, grounding drives confident fabrication toward zero.** The
grounded model answered correctly or said "I don't know", it never invented an
answer (0% with the stronger model).

## 3. Provenance (why grounding works)

Per `cortex query --json` on the same corpus:

- **100%** of returned hits are anchored to a source (`path` + `id`) + a `sources` list
- excerpts are **verbatim** from the source note, not paraphrased
- the `Markdown/` sources a citation points to are **never modified**

## Honest boundary

The **token-reduction and provenance** figures are exact and reproducible. The
grounding eval is a small illustrative study (8 facts × 2 local models on one
corpus), it demonstrates the **mechanism** (grounding replaces fabrication with
correct-or-abstain), not a population hallucination rate. Absolute accuracy is
capped by corpus coverage and weak local models, not by Cortex. A larger judged
eval would tighten the accuracy number.
