# Cortex portable distillation — one methodology, any agent, any person — design

> **Status:** designed on `feat/portable-distillation`. Not yet implemented.
> **Builds on:** the shipped atomize pipeline (`src/atomize/emit.ts`, `apply-distilled.ts`, `plan.ts`, the `.cortex/backups/` reversible model), the MCP write surface (`src/mcp/server.ts`, `tools-write.ts` — `cortex_atomize_emit` / `cortex_atomize_apply`), and the `/atomize` Claude Code skill (`skills/atomize/SKILL.md`). No new write, backup, or reversibility logic — this design only makes the *distillation methodology* portable and adds one no-agent distiller.
> **Branch:** `feat/portable-distillation`.
> **Product context:** open-sourcing readiness. Today, high-quality atomization depends on the `/atomize` **Claude Code skill**, whose `SKILL.md` carries the distillation methodology by hand. The mechanical engine (`emit` → `apply`) contains no AI and is already agent-agnostic; the MCP `cortex_atomize_emit` even hands any agent a worksheet to distill. But the *methodology* — the tuned rules that make notes good — lives only in the Claude skill. So a non-Claude distiller (Copilot/Cursor over MCP, a terminal user with an API key) gets the data but not the rules, and produces worse notes. This design extracts the methodology into a single shared source that travels in the `emit` worksheet, so **every** distiller — the Claude skill, any MCP agent, and a new no-agent BYO-key path — follows the same rules. This is point #1 of three open-source hardening items; bootstrap (auto-document a whole repo) and README/i18n are separate later cycles.

## 1. Goal

Make Cortex atomization produce the same-quality notes regardless of **who or what** distills — Claude Code, an MCP agent running any model (e.g. Copilot with an Anthropic model in VS Code), or a terminal user with no agent at all. Concretely:

1. **One source of truth** for the distillation methodology, owned by the engine.
2. It **travels in the `emit` worksheet** so it reaches every consumer without per-consumer wiring.
3. The `/atomize` Claude skill **references** that source instead of duplicating it (no drift).
4. A new **BYO-key** path (`cortex atomize --model …`) lets someone with no agent distill using their own API key or a local model, reusing the same methodology and the same reversible `apply`.

Out of scope for this cycle: the install-time repo bootstrap (#2), README rewrite / multi-language (#3), a no-model mechanical-only fallback, and any networked/multi-tenant concerns. Cortex stays local-first, single-user.

## 2. Design principles

- **The distiller is the caller; the engine only delivers rules + data.** The engine stays AI-free. Its job grows by exactly one field: the `emit` worksheet now carries the *methodology* (rules) alongside the *worksheet* (data). Whoever distills — Claude, an MCP agent, a raw LLM call — reads both and returns note specs.
- **`emit` is the single delivery seam.** All three consumers already pass through `emitPlan`: the Claude skill via `--emit-json`, MCP via `cortex_atomize_emit`, and the new BYO-key path internally. Deliver the methodology there once and it propagates everywhere. No consumer learns *where* the methodology came from — it just reads `instructions`.
- **One source of truth, referenced not copied.** The methodology becomes a constant in the engine. `SKILL.md` stops carrying its own copy and points at the emitted field. B (put it in the MCP tool description) and C (a separate `.md` file) were rejected: both reintroduce a second copy or npm-packaging friction — the exact drift we are removing.
- **Reuse the engine, don't reimplement.** BYO-key is `emit` → LLM call → `applyDistilled` — steps 1 and 3 are existing, untouched code. Only the middle (prompt → model → parse) is new. Same safety net as every other path: dry-run default, `_inbox/` draft barrier, `.cortex/` backups, `cortex undo`, immutable `Markdown/`.
- **Light base install.** No new npm dependencies. The BYO-key client uses native `fetch` (Node 18+) against plain JSON HTTP APIs, matching the repo's `@xenova/transformers`-as-optional-peer philosophy. Someone who never uses BYO-key pays zero added weight.
- **Additive, non-breaking.** Adding `instructions` to the worksheet is purely additive. The current Claude skill keeps working unchanged until we slim it; existing MCP agents keep working. Nothing that reads the worksheet today breaks.
- **Fail safe, never half-write.** A missing API key, a non-JSON model response, or a network error surfaces a clean error and writes nothing. Dry-run remains the default.

## 3. Architecture

```
                 toolkit/src/atomize/methodology.ts
                 (THE single source — DISTILL_METHODOLOGY constant)
                              │
                              ▼
     emitPlan(vault, source, config) ──► worksheet {
         segments, knownTypes, knownFolders,       ← data (unchanged)
         statusFirst, lang, fields,
         instructions   ◄── NEW: the portable methodology
     }
                              │
      ┌───────────────────────┼───────────────────────┐
      ▼                       ▼                       ▼
 Claude skill            MCP agent               BYO-key (new)
 (--emit-json)        (cortex_atomize_emit)   (cortex atomize --model)
      │                       │                       │
 Claude distills        agent distills          LLM distills
 per instructions       per instructions        per instructions
      │                       │                       │
      └───────────────────────┼───────────────────────┘
                              ▼
           applyDistilled(...) ─► drafts to _inbox/
           (backups, reversible — EXISTS, untouched)
```

The contract between the engine and "whoever distills" is the worksheet JSON. It changes shape in exactly one way: it gains `instructions`. Everything downstream (`applyDistilled`, backups, promote, undo) is unchanged.

## 4. Components

### 4.1 Changes to existing pieces (small)

| File | Change |
|---|---|
| `atomize/methodology.ts` | **NEW.** Exports `DISTILL_METHODOLOGY: string` — the methodology currently hand-written in `SKILL.md` §3: atomic (one idea per note), the phantom-wikilink rule (never write illustrative `[[...]]` in a body), update-vs-create-vs-skip, the cold-vault canonical taxonomy fallback, tags + `lang`, mandatory citations, conservative-merge rules. Written as instructions to a model; it refers to the worksheet's own fields (`knownTypes`, `knownFolders`, `statusFirst`, `lang`, `existing`) for the per-vault specifics, so the constant stays static. |
| `atomize/emit.ts` | `emitPlan` sets `instructions: DISTILL_METHODOLOGY` on its returned object. One line. |
| `types.ts` | `AtomizeEmitPlan` gains `instructions: string`. |
| `mcp/server.ts` | `cortex_atomize_emit` description gains a sentence: *"Follow the `instructions` field in the returned worksheet to distill with quality."* Text only — the handler already returns `emitPlan(...)`, which now includes `instructions`. |
| `skills/atomize/SKILL.md` | Slimmed: step 3's inline rule block is replaced by "distill each segment following the `instructions` field emitted by the toolkit." Procedure (resolve → emit → distill → apply → promote) stays. The skill becomes a thin Claude-Code wrapper; the rules live in the engine. |

### 4.2 New piece — the BYO-key distiller

| File | Responsibility |
|---|---|
| `atomize/distill-llm.ts` | **NEW.** The no-agent distiller. Flow: `emitPlan` → build the prompt (`instructions` as the system message + the worksheet JSON as the user message, asking for the `{ source, notes: DistilledNote[] }` shape `/atomize` already uses) → call the LLM via an `LlmClient` → parse the response → hand `notes` to `applyDistilled`. Contains no write/backup logic. |
| `atomize/llm-client.ts` | **NEW.** Minimal provider abstraction, native `fetch`, no SDKs. Interface `LlmClient { complete(system, user): Promise<string> }` with two implementations:<br>• `OpenAiCompatClient` → `POST {baseUrl}/chat/completions` (covers OpenAI, Ollama, LM Studio, OpenRouter, Together, Groq — anything OpenAI-compatible via base URL).<br>• `AnthropicClient` → `POST https://api.anthropic.com/v1/messages`.<br>~30 lines each. |
| `commands/atomize.ts` + `cli.ts` | `atomize` gains flags `--model <spec>` and `--base-url <url>`. When `--model` is present, run the BYO-key flow (`distill-llm`) instead of the emit-json/manual path; honor `--write` (dry-run default). |

**`--model` spec grammar:** `anthropic:<model>`, `openai:<model>`, or `openai-compat:<model>` paired with `--base-url` (e.g. `--model openai-compat:llama3 --base-url http://localhost:11434/v1` for a local Ollama).

**API keys:** read only from environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; `OPENAI_BASE_URL` honored as a default base URL). Never accepted as a flag, never written to disk.

## 5. Data flow — BYO-key

```
cortex atomize src.md --model anthropic:<model> [--write]
  1. emitPlan(vault, src, config)     → worksheet { …, instructions }        [existing]
  2. prompt = instructions (system) + worksheet-as-JSON (user)               [new]
  3. client.complete(prompt)          → model text                            [new]
  4. parse → { source, notes: DistilledNote[] }                              [new]
  5. applyDistilled(vault, notes, config, { dryRun: !write })                 [existing]
                                       → drafts to _inbox/, backups, reversible
```

Steps 1 and 5 are existing, untouched code. The Claude-skill and MCP paths reach the same `applyDistilled` by their own routes; only their *distiller* differs.

## 6. Error handling

Every failure writes nothing and leaves the vault untouched.

| Situation | Behavior |
|---|---|
| Missing API key | Clean error that **names the expected env var** (`ANTHROPIC_API_KEY`, etc.). Does not run. |
| Model returns non-JSON / malformed specs | Parse guard: show the raw response + the parse error, **write nothing**. |
| Network / provider 4xx–5xx | Propagate with the provider's message. Write nothing. |
| No `--write` | Dry-run by default (Cortex-wide convention): preview the plan, write nothing. |
| Update that shrinks a note | Reuse `applyDistilled`'s existing shrink-guard — not reimplemented. `--force` bypasses, same as the CLI. |
| Back-compat | `instructions` is additive; the current Claude skill and existing MCP agents keep working before/without the SKILL.md slim. No breaking change. |

## 7. Testing

- **Unit — emit:** `emitPlan` output includes a non-empty `instructions`.
- **Unit — methodology:** `DISTILL_METHODOLOGY` contains the load-bearing rules (atomic, phantom-wikilink prohibition, update-vs-create). Guards against accidental deletion / silent gutting.
- **Unit — BYO-key with a mocked `LlmClient`:** a canned model response parses to the correct `DistilledNote[]` and calls `applyDistilled` with the right args; dry-run is the default; a missing key raises the named-env-var error; `--model` spec strings map to the correct client + endpoint.
- **Unit — llm-client:** request shaping for both providers (endpoint, headers, body) against a mocked `fetch`; a provider error maps to a clean thrown error.
- **Integration / manual (quality parity):** a real run on a small vault with **Anthropic** and with an **OpenAI-compatible (local Ollama)** model, comparing note quality against the Claude-skill baseline. Includes the previously-flagged **real Copilot-over-MCP test** to confirm an MCP agent, now receiving `instructions`, distills at parity.

## 8. Open questions / deferred

- **Bootstrap (#2)** — auto-documenting an undocumented repo (reading code files, not just markdown) is a separate design cycle. It will *consume* this portable methodology (likely via BYO-key or an MCP agent), which is one reason to land this first.
- **README / i18n (#3)** — separate cycle; will tell the "any agent, any person" story this design makes true.
- **Prompt size** — `instructions` adds a fixed block of text to every worksheet. It is plain text and cheap, but if payload size ever matters for a constrained MCP client, a future `emit --no-instructions` opt-out is trivial. Not needed now (YAGNI).
