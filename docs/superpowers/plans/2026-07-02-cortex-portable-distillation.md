# Cortex Portable Distillation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cortex atomization produce the same-quality notes no matter who distills — the Claude skill, any MCP agent, or a terminal user with no agent — by moving the distillation methodology into one engine-owned source that travels in the `emit` worksheet, and adding a BYO-key distiller.

**Architecture:** A single constant `DISTILL_METHODOLOGY` (new `methodology.ts`) is delivered as a new `instructions` field on the `emit` worksheet, which all three consumers already pass through. The Claude `SKILL.md` and the MCP tool description stop carrying their own copy and point at that field. A new no-agent path (`cortex atomize --model …`) calls an injected `LlmClient` (native `fetch`, OpenAI-compatible + Anthropic) between the existing `emitPlan` and `applyDistilled`, reusing the full reversible write path.

**Tech Stack:** Node ≥18 (ESM, native global `fetch`), TypeScript, vitest. No new npm dependencies.

## Global Constraints

- **ESM with `.js` import specifiers** — all relative imports end in `.js` even from `.ts` sources (project convention).
- **No new npm dependencies** — the BYO-key client uses the native global `fetch` (Node ≥18). `@xenova/transformers` stays the model for optional heavy features.
- **Dry-run is the default** — every write path writes only when `write: true` / `--write` is passed.
- **Reuse the engine, never reimplement** — BYO-key ends at `applyDistilledInput`; no new write, backup, slug, or reversibility logic.
- **API keys only from environment** — never accepted as a flag, never written to disk.
- **Additive, non-breaking** — adding `instructions` must not change any existing `emit` assertion or break existing MCP/skill consumers.
- **Tests:** `npm test` runs `vitest run` from `toolkit/`. Run a single file with `npx vitest run test/<file>.test.ts`.
- **Generic/public repo** — no client names, real metrics, or proprietary data in any code, test fixture, or doc.

---

### Task 1: Methodology constant delivered through `emit`

**Files:**
- Create: `toolkit/src/atomize/methodology.ts`
- Modify: `toolkit/src/types.ts` (add `instructions` to `AtomizeEmitPlan`, ~line 152–161)
- Modify: `toolkit/src/atomize/emit.ts` (set `instructions` in the returned object, ~line 30–40)
- Test: `toolkit/test/methodology.test.ts` (create), `toolkit/test/emit.test.ts` (add one case)

**Interfaces:**
- Produces: `export const DISTILL_METHODOLOGY: string` from `atomize/methodology.js`.
- Produces: `AtomizeEmitPlan.instructions: string` — now present on every `emitPlan(...)` result.

- [ ] **Step 1: Write the failing methodology unit test**

Create `toolkit/test/methodology.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DISTILL_METHODOLOGY } from '../src/atomize/methodology.js';

describe('DISTILL_METHODOLOGY', () => {
  it('is a non-trivial instruction block', () => {
    expect(DISTILL_METHODOLOGY.length).toBeGreaterThan(400);
  });

  it('carries the load-bearing rules that keep notes good', () => {
    const text = DISTILL_METHODOLOGY.toLowerCase();
    // atomic — one idea per note
    expect(text).toContain('one idea per note');
    // the phantom-wikilink prohibition (the highest-value rule)
    expect(text).toContain('[[');
    expect(text).toMatch(/phantom|illustrative|example/);
    // update-vs-create-vs-skip
    expect(text).toContain('update');
    expect(text).toContain('skip');
    // citations are mandatory
    expect(text).toContain('citation');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/methodology.test.ts`
Expected: FAIL — `Cannot find module '../src/atomize/methodology.js'`.

- [ ] **Step 3: Create the methodology constant**

Create `toolkit/src/atomize/methodology.ts`:

```ts
// toolkit/src/atomize/methodology.ts
//
// The single source of truth for HOW to distill a source into atomic notes.
// It used to live by hand inside the Claude `/atomize` skill (SKILL.md §3).
// It now lives here, in the engine, and travels to every consumer as the
// `instructions` field of the emit worksheet (see emit.ts). The Claude skill,
// any MCP agent, and the BYO-key CLI path all follow this same text — so note
// quality no longer depends on which agent (or none) does the distilling.
//
// This is instructions addressed to whatever model is distilling. It refers to
// the worksheet's own fields (knownTypes, knownFolders, statusFirst, lang,
// existing) for per-vault specifics, so the constant itself stays static.

export const DISTILL_METHODOLOGY = `You are the AI distillation layer of the N1X Cortex atomize pipeline. You are given a worksheet (JSON) describing a source document already split into segments, plus the current vault's known types, known folders and existing notes. Distill the segments into atomic note specs. The deterministic toolkit writes the files — you only produce data.

Follow this methodology exactly:

- Atomic — one idea per note. If a segment covers two things that could change independently, split it into multiple notes.
- Type: choose from the worksheet's \`knownTypes\`. Only introduce a new type when none fits, and say so in your summary.
- Folder: route from the worksheet's \`knownFolders\`, matching the vault's type→folder convention.
- Cold-vault fallback: if \`knownTypes\`/\`knownFolders\` are empty, seed the canonical vocabulary — types concept/flow/rule/technical/error/security/ux/mvp/strategy, folders 01-Concepts/ … 09-Strategy/ — localized to the worksheet's \`lang\` when set, and note that a new taxonomy is being seeded.
- Body: rewrite into clean, structured natural language — not a copy of the source. For flow/process notes, add an "Implications for implementation" section.
- Connect: add [[wikilinks]] to related notes, including notes in the worksheet's \`existing\` list. Dangling links are valid.
- NEVER write illustrative or example [[wikilinks]] in a body. The engine parses every [[...]] as a real link, so example syntax becomes a phantom orphan in the graph. Only link to notes that exist or that you are genuinely creating. To describe link syntax, write it in prose or inline code, never as a bare [[name]].
- Tags + language: add \`tags\`; write every note in the worksheet's \`lang\`.
- No duplicates: if a strong match already exists in \`existing\`, drop that note (the toolkit will also skip it).
- Update vs create vs skip: for a segment that matches an existing note AND adds information, emit an update — produce a conservative merged body that integrates the new info, preserves ALL existing content, links and human edits, keeps every citation, and keeps the note's # heading. Shape: { "action": "update", "targetPath": "<existing path>", "title": "...", "body": "<full merged body incl. heading>" }. If the existing note already covers the segment, skip it (omit it). Only create notes omit \`action\`/\`targetPath\`.
- Citations are mandatory — the toolkit adds them; keep the \`source\` correct.

Return ONLY a JSON object of shape { "source": "<worksheet.source>", "notes": [ ... ] }, where each note is either a create { "title", "type", "folder", "tags", "body", "fromHeading" } or an update { "action": "update", "targetPath", "title", "body" }.`;
```

- [ ] **Step 4: Add `instructions` to the `AtomizeEmitPlan` type**

In `toolkit/src/types.ts`, add the field to the `AtomizeEmitPlan` interface (after `segments`):

```ts
export interface AtomizeEmitPlan {
  source: string;
  sourcePath: string;
  lang: string | null;
  fields: CortexFields;
  statusFirst: string;
  knownTypes: string[];
  knownFolders: string[];
  existing: EmitExistingNote[];
  segments: Segment[];
  instructions: string;
}
```

- [ ] **Step 5: Deliver it from `emitPlan`**

In `toolkit/src/atomize/emit.ts`, add the import at the top:

```ts
import { DISTILL_METHODOLOGY } from './methodology.js';
```

Then add `instructions` to the returned object (the block ending ~line 40):

```ts
  return {
    source,
    sourcePath,
    lang: config.lang,
    fields: config.fields,
    statusFirst: config.statusLifecycle[0] ?? 'draft',
    knownTypes,
    knownFolders,
    existing,
    segments,
    instructions: DISTILL_METHODOLOGY,
  };
```

- [ ] **Step 6: Add the emit delivery test**

In `toolkit/test/emit.test.ts`, add a new case inside `describe('emitPlan', …)`:

```ts
  it('carries the portable distillation methodology in instructions', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const plan = emitPlan(dir, join(dir, 'Markdown', 'src.md'), cfg);
    expect(plan.instructions).toBeTypeOf('string');
    expect(plan.instructions.length).toBeGreaterThan(400);
    expect(plan.instructions.toLowerCase()).toContain('one idea per note');
  });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/methodology.test.ts test/emit.test.ts`
Expected: PASS (all cases, including the pre-existing emit assertions unchanged).

- [ ] **Step 8: Commit**

```bash
git add toolkit/src/atomize/methodology.ts toolkit/src/types.ts toolkit/src/atomize/emit.ts toolkit/test/methodology.test.ts toolkit/test/emit.test.ts
git commit -m "feat(atomize): single-source distillation methodology delivered via emit"
```

---

### Task 2: MCP agents receive it; the Claude skill references it

**Files:**
- Modify: `toolkit/src/mcp/server.ts` (the `cortex_atomize_emit` description, ~line 128–134)
- Modify: `toolkit/skills/atomize/SKILL.md` (slim step 3)
- Test: `toolkit/test/mcp-tools-write.test.ts` (add one case)

**Interfaces:**
- Consumes: `AtomizeEmitPlan.instructions` from Task 1.
- Produces: no new exports — verifies the methodology reaches the MCP seam and removes the skill's duplicate copy.

- [ ] **Step 1: Write the failing MCP-seam test**

In `toolkit/test/mcp-tools-write.test.ts`, add a case that calls the emit tool and asserts the methodology rides along. (Mirror the file's existing `vault()` helper and imports; if `atomizeEmitTool` is not yet imported there, add it to the existing import from `../src/mcp/tools-write.js`.)

```ts
import { atomizeEmitTool } from '../src/mcp/tools-write.js';

it('cortex_atomize_emit hands the agent the distillation methodology', () => {
  const dir = vault(); // existing helper in this file; creates Markdown/ + a source
  const plan = atomizeEmitTool(dir, { source: 'Markdown/src.md' });
  expect(plan.instructions.toLowerCase()).toContain('one idea per note');
});
```

If the file's `vault()` helper does not already write `Markdown/src.md`, create the source inside the test before calling:

```ts
// if needed:
writeFileSync(join(dir, 'Markdown', 'src.md'), '# S\n\n## A\n\nBody.');
```

- [ ] **Step 2: Run it to verify it passes already (delivery is automatic)**

Run: `cd toolkit && npx vitest run test/mcp-tools-write.test.ts`
Expected: PASS — `atomizeEmitTool` returns `emitPlan(...)`, which now includes `instructions`. This test locks that guarantee so a future refactor can't silently drop it.

- [ ] **Step 3: Point the MCP tool description at the field**

In `toolkit/src/mcp/server.ts`, update the `cortex_atomize_emit` description string (~line 131–133) to:

```ts
      description:
        'Read a source under the vault and return the distillation worksheet (segments + existing-note context) so YOU, the calling agent, can distill it into note specs to pass to cortex_atomize_apply. Follow the `instructions` field in the returned worksheet to distill with quality. Read-only.',
```

- [ ] **Step 4: Slim the Claude skill so it references the field**

In `toolkit/skills/atomize/SKILL.md`, replace the entire bulleted rule block under step 3 ("**Distill each segment** into one or more atomic notes, following the methodology:" and all its sub-bullets) with a single reference. The step becomes:

```markdown
3. **Distill each segment** into one or more atomic notes, following the `instructions` field emitted by the toolkit. The emit output now carries the full distillation methodology (atomic notes, type/folder routing, the phantom-wikilink prohibition, update-vs-create-vs-skip, cold-vault taxonomy, citations) — treat that `instructions` text as authoritative. Produce the note specs it describes.
```

Leave steps 1, 2, 4, 5, 6, 7 and the Safety section unchanged.

- [ ] **Step 5: Verify the skill no longer duplicates the rules**

Run: `grep -c "one idea per note" toolkit/skills/atomize/SKILL.md`
Expected: `0` (the rule now lives only in `methodology.ts`).

Run the MCP suite again to confirm nothing regressed:
Run: `cd toolkit && npx vitest run test/mcp-tools-write.test.ts test/mcp-server-write.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add toolkit/src/mcp/server.ts toolkit/skills/atomize/SKILL.md toolkit/test/mcp-tools-write.test.ts
git commit -m "feat(atomize): MCP agents receive methodology; Claude skill references it (no drift)"
```

---

### Task 3: The BYO-key LLM client (native fetch, two providers)

**Files:**
- Create: `toolkit/src/atomize/llm-client.ts`
- Test: `toolkit/test/llm-client.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface LlmClient { complete(system: string, user: string): Promise<string> }`
  - `interface LlmModelSpec { provider: 'anthropic' | 'openai' | 'openai-compat'; model: string; baseUrl?: string }`
  - `function parseModelSpec(spec: string): LlmModelSpec`
  - `function makeLlmClient(spec: LlmModelSpec, env: NodeJS.ProcessEnv): LlmClient`
  - `class OpenAiCompatClient implements LlmClient` (`constructor(baseUrl: string, apiKey: string, model: string)`)
  - `class AnthropicClient implements LlmClient` (`constructor(apiKey: string, model: string)`)

- [ ] **Step 1: Write the failing spec-parse + factory tests**

Create `toolkit/test/llm-client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseModelSpec, makeLlmClient, AnthropicClient, OpenAiCompatClient,
} from '../src/atomize/llm-client.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('parseModelSpec', () => {
  it('parses provider:model on the first colon only', () => {
    expect(parseModelSpec('anthropic:claude-3-5-sonnet')).toEqual({ provider: 'anthropic', model: 'claude-3-5-sonnet' });
    expect(parseModelSpec('openai:gpt-4o')).toEqual({ provider: 'openai', model: 'gpt-4o' });
    // model names may themselves contain a colon (e.g. ollama tags)
    expect(parseModelSpec('openai-compat:llama3:8b')).toEqual({ provider: 'openai-compat', model: 'llama3:8b' });
  });
  it('rejects unknown providers and missing colon', () => {
    expect(() => parseModelSpec('gpt-4o')).toThrow(/provider:model/);
    expect(() => parseModelSpec('bard:x')).toThrow(/unknown provider/i);
  });
});

describe('makeLlmClient', () => {
  it('builds an Anthropic client from ANTHROPIC_API_KEY', () => {
    const c = makeLlmClient({ provider: 'anthropic', model: 'm' }, { ANTHROPIC_API_KEY: 'k' } as NodeJS.ProcessEnv);
    expect(c).toBeInstanceOf(AnthropicClient);
  });
  it('names the missing env var for anthropic', () => {
    expect(() => makeLlmClient({ provider: 'anthropic', model: 'm' }, {} as NodeJS.ProcessEnv))
      .toThrow(/ANTHROPIC_API_KEY/);
  });
  it('requires --base-url for openai-compat', () => {
    expect(() => makeLlmClient({ provider: 'openai-compat', model: 'm' }, {} as NodeJS.ProcessEnv))
      .toThrow(/base-url/);
  });
  it('builds an OpenAI-compatible client with an explicit base url and no key (local server)', () => {
    const c = makeLlmClient({ provider: 'openai-compat', model: 'm', baseUrl: 'http://localhost:11434/v1' }, {} as NodeJS.ProcessEnv);
    expect(c).toBeInstanceOf(OpenAiCompatClient);
  });
});

describe('AnthropicClient.complete', () => {
  it('POSTs to the messages endpoint and returns the text block', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'HELLO' }] }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const out = await new AnthropicClient('k', 'claude-x').complete('sys', 'usr');
    expect(out).toBe('HELLO');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init as RequestInit).headers).toMatchObject({ 'x-api-key': 'k', 'anthropic-version': '2023-06-01' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'usr' }]);
  });
  it('throws a clean error on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    await expect(new AnthropicClient('k', 'm').complete('s', 'u')).rejects.toThrow(/anthropic api error 401/i);
  });
});

describe('OpenAiCompatClient.complete', () => {
  it('POSTs chat/completions and returns the message content', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: 'WORLD' } }] }), { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const out = await new OpenAiCompatClient('http://host/v1', 'k', 'gpt-x').complete('sys', 'usr');
    expect(out).toBe('WORLD');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://host/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer k' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages).toEqual([{ role: 'system', content: 'sys' }, { role: 'user', content: 'usr' }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/llm-client.test.ts`
Expected: FAIL — `Cannot find module '../src/atomize/llm-client.js'`.

- [ ] **Step 3: Implement the client**

Create `toolkit/src/atomize/llm-client.ts`:

```ts
// toolkit/src/atomize/llm-client.ts
//
// The BYO-key LLM surface for the no-agent distillation path. Native `fetch`
// only — no SDKs, no new dependencies — so the base install stays light and
// someone who never uses --model pays nothing. Two providers cover the field:
// an OpenAI-compatible HTTP client (OpenAI, Ollama, LM Studio, OpenRouter,
// Together, Groq — anything with a configurable base URL) and the native
// Anthropic messages endpoint.

const MAX_TOKENS = 8192;

export interface LlmClient {
  complete(system: string, user: string): Promise<string>;
}

export interface LlmModelSpec {
  provider: 'anthropic' | 'openai' | 'openai-compat';
  model: string;
  baseUrl?: string;
}

/** Parse a `--model` spec like `anthropic:claude-...` / `openai-compat:llama3:8b`. */
export function parseModelSpec(spec: string): LlmModelSpec {
  const i = spec.indexOf(':');
  if (i <= 0) throw new Error(`--model must be provider:model (e.g. anthropic:claude-3-5-sonnet), got "${spec}"`);
  const provider = spec.slice(0, i);
  const model = spec.slice(i + 1);
  if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'openai-compat') {
    throw new Error(`unknown provider "${provider}" — use anthropic, openai, or openai-compat`);
  }
  if (!model) throw new Error(`--model is missing a model name after "${provider}:"`);
  return { provider, model };
}

/** Build the right client from a spec + the process environment (keys never come from flags). */
export function makeLlmClient(spec: LlmModelSpec, env: NodeJS.ProcessEnv): LlmClient {
  if (spec.provider === 'anthropic') {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Missing ANTHROPIC_API_KEY environment variable');
    return new AnthropicClient(key, spec.model);
  }
  // openai + openai-compat share the OpenAI-compatible wire shape
  const baseUrl = spec.baseUrl
    ?? env.OPENAI_BASE_URL
    ?? (spec.provider === 'openai' ? 'https://api.openai.com/v1' : undefined);
  if (!baseUrl) throw new Error('openai-compat models need --base-url (e.g. http://localhost:11434/v1)');
  const key = env.OPENAI_API_KEY;
  if (spec.provider === 'openai' && !key) throw new Error('Missing OPENAI_API_KEY environment variable');
  // local OpenAI-compatible servers often ignore the key — default to empty
  return new OpenAiCompatClient(baseUrl.replace(/\/$/, ''), key ?? '', spec.model);
}

export class AnthropicClient implements LlmClient {
  constructor(private apiKey: string, private model: string) {}
  async complete(system: string, user: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { content?: { type: string; text?: string }[] };
    const text = data.content?.find(b => b.type === 'text')?.text;
    if (!text) throw new Error('Anthropic API returned no text content');
    return text;
  }
}

export class OpenAiCompatClient implements LlmClient {
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}
  async complete(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI-compatible API error ${res.status}: ${await res.text()}`);
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI-compatible API returned no message content');
    return text;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/llm-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/llm-client.ts toolkit/test/llm-client.test.ts
git commit -m "feat(atomize): BYO-key LLM client — native fetch, Anthropic + OpenAI-compatible"
```

---

### Task 4: The BYO-key distiller (emit → prompt → model → apply)

**Files:**
- Create: `toolkit/src/atomize/distill-llm.ts`
- Test: `toolkit/test/distill-llm.test.ts` (create)

**Interfaces:**
- Consumes: `LlmClient` from Task 3; `emitPlan` (`atomize/emit.js`); `applyDistilledInput` (`atomize/apply-distilled.js`, signature `(vaultDir, input: DistilledInput, config, opts?: { dryRun?; force?; runId? }) => DistilledApplyResult`); `AtomizeEmitPlan`, `DistilledInput`, `DistilledApplyResult` (`types.js`).
- Produces:
  - `function buildDistillPrompt(plan: AtomizeEmitPlan): { system: string; user: string }`
  - `function parseDistilledResponse(text: string, source: string): DistilledInput`
  - `async function distillWithLlm(vaultDir: string, sourcePath: string, config: CortexConfig, client: LlmClient, opts?: { write?: boolean; force?: boolean }): Promise<DistilledApplyResult>`

- [ ] **Step 1: Write the failing tests**

Create `toolkit/test/distill-llm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDistillPrompt, parseDistilledResponse, distillWithLlm } from '../src/atomize/distill-llm.js';
import { emitPlan } from '../src/atomize/emit.js';
import { loadConfig } from '../src/config.js';
import type { LlmClient } from '../src/atomize/llm-client.js';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-distill-'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '03-Rules'));
  writeFileSync(join(dir, '03-Rules', 'b.md'), '---\ntype: rule\n---\n# Existing');
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# Src\n\n## Topic A\n\nBody A.');
  return dir;
}

const cannedNote = { title: 'Topic A', type: 'rule', folder: '03-Rules', tags: ['rule'], body: 'Distilled body.' };

function fakeClient(reply: string): LlmClient {
  return { complete: async () => reply };
}

describe('buildDistillPrompt', () => {
  it('puts the methodology in system and the worksheet JSON in user', () => {
    const dir = vault();
    const plan = emitPlan(dir, join(dir, 'Markdown', 'src.md'), loadConfig(dir, []));
    const { system, user } = buildDistillPrompt(plan);
    expect(system).toBe(plan.instructions);
    expect(user).toContain('"source"');
    expect(JSON.parse(user).segments.length).toBeGreaterThan(0);
  });
});

describe('parseDistilledResponse', () => {
  it('parses a bare JSON object', () => {
    const input = parseDistilledResponse(JSON.stringify({ source: 'x', notes: [cannedNote] }), 'src');
    expect(input.source).toBe('src'); // source is forced to the real source, not the model's
    expect(input.notes[0].title).toBe('Topic A');
  });
  it('parses JSON wrapped in a ```json fence with prose around it', () => {
    const text = 'Sure!\n```json\n' + JSON.stringify({ source: 'x', notes: [cannedNote] }) + '\n```\nDone.';
    const input = parseDistilledResponse(text, 'src');
    expect(input.notes).toHaveLength(1);
  });
  it('throws a clean error when there is no JSON object', () => {
    expect(() => parseDistilledResponse('I could not do that.', 'src')).toThrow(/could not parse/i);
  });
});

describe('distillWithLlm', () => {
  it('dry-runs by default — nothing is written', async () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const client = fakeClient(JSON.stringify({ source: 'src', notes: [cannedNote] }));
    const res = await distillWithLlm(dir, join(dir, 'Markdown', 'src.md'), cfg, client);
    expect(res.plan.dryRun).toBe(true);
    expect(res.written).toHaveLength(0);
  });
  it('writes a draft to _inbox/ when write:true', async () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const client = fakeClient(JSON.stringify({ source: 'src', notes: [cannedNote] }));
    const res = await distillWithLlm(dir, join(dir, 'Markdown', 'src.md'), cfg, client, { write: true });
    expect(res.plan.dryRun).toBe(false);
    expect(res.written.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, res.written[0]))).toBe(true);
    expect(res.written[0].startsWith('_inbox/')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/distill-llm.test.ts`
Expected: FAIL — `Cannot find module '../src/atomize/distill-llm.js'`.

- [ ] **Step 3: Implement the distiller**

Create `toolkit/src/atomize/distill-llm.ts`:

```ts
// toolkit/src/atomize/distill-llm.ts
//
// The no-agent distillation path. It sits exactly in the seam the MCP agent and
// the Claude skill occupy: between emitPlan (data + methodology) and
// applyDistilledInput (reversible write). The LlmClient is injected so this is
// unit-testable without a network, and so the CLI owns provider/key wiring.

import { emitPlan } from './emit.js';
import { applyDistilledInput } from './apply-distilled.js';
import type { LlmClient } from './llm-client.js';
import type { AtomizeEmitPlan, DistilledInput, DistilledApplyResult, CortexConfig } from '../types.js';

/** System = the portable methodology; user = the worksheet as JSON. */
export function buildDistillPrompt(plan: AtomizeEmitPlan): { system: string; user: string } {
  return { system: plan.instructions, user: JSON.stringify(plan) };
}

/**
 * Parse the model's reply into distilled specs. Models often wrap JSON in a
 * ```json fence or surround it with prose, so we extract the first balanced
 * object. `source` is forced to the real source path — never trusted from the
 * model — so citations stay correct.
 */
export function parseDistilledResponse(text: string, source: string): DistilledInput {
  const raw = extractJsonObject(text);
  if (!raw) throw new Error(`Could not parse a JSON object from the model response:\n${text.slice(0, 500)}`);
  let parsed: { notes?: unknown };
  try {
    parsed = JSON.parse(raw) as { notes?: unknown };
  } catch (e) {
    throw new Error(`Could not parse model response as JSON (${(e as Error).message}):\n${raw.slice(0, 500)}`);
  }
  if (!Array.isArray(parsed.notes)) throw new Error('Model response has no "notes" array');
  return { source, notes: parsed.notes as DistilledInput['notes'] };
}

/** First `{ … }` block, unwrapping a ```json fence if present. */
function extractJsonObject(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

/** emit → prompt → model → parse → reversible apply. Dry-run by default. */
export async function distillWithLlm(
  vaultDir: string,
  sourcePath: string,
  config: CortexConfig,
  client: LlmClient,
  opts: { write?: boolean; force?: boolean } = {},
): Promise<DistilledApplyResult> {
  const plan = emitPlan(vaultDir, sourcePath, config);
  const { system, user } = buildDistillPrompt(plan);
  const reply = await client.complete(system, user);
  const input = parseDistilledResponse(reply, plan.source);
  return applyDistilledInput(vaultDir, input, config, { dryRun: !opts.write, force: opts.force });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd toolkit && npx vitest run test/distill-llm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/atomize/distill-llm.ts toolkit/test/distill-llm.test.ts
git commit -m "feat(atomize): BYO-key distiller — emit to model to reversible apply"
```

---

### Task 5: CLI wiring, usage, and README

**Files:**
- Modify: `toolkit/src/commands/atomize.ts` (add `runDistillLlm`)
- Modify: `toolkit/src/cli.ts` (parse `--model`/`--base-url` in the `atomize` case, ~line 112–137; update `USAGE`/help lines ~25–33)
- Test: `toolkit/test/atomize.test.ts` or `toolkit/test/commands.test.ts` (add a wiring/error case)
- Modify: `README.md` (document the new no-agent path — repo convention: README updated on every push)

**Interfaces:**
- Consumes: `parseModelSpec`, `makeLlmClient` (Task 3); `distillWithLlm` (Task 4); `formatDistilledPlan` (existing, `commands/atomize.js`); `loadConfig`, `collectFrontmatterKeys`.
- Produces: `async function runDistillLlm(vaultDir: string, sourcePath: string, opts: { model: string; baseUrl?: string; write?: boolean; force?: boolean; env?: NodeJS.ProcessEnv }): Promise<DistilledApplyResult>`

- [ ] **Step 1: Write the failing wiring test**

In `toolkit/test/atomize.test.ts` add a case (reuse or mirror the file's temp-vault helper; create one inline if none exists):

```ts
import { runDistillLlm } from '../src/commands/atomize.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('runDistillLlm surfaces the named env var when the key is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-byok-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'src.md'), '# S\n\n## A\n\nBody.');
  await expect(
    runDistillLlm(dir, join(dir, 'Markdown', 'src.md'), { model: 'anthropic:claude-x', env: {} as NodeJS.ProcessEnv }),
  ).rejects.toThrow(/ANTHROPIC_API_KEY/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd toolkit && npx vitest run test/atomize.test.ts`
Expected: FAIL — `runDistillLlm` is not exported.

- [ ] **Step 3: Add `runDistillLlm` to the atomize command module**

In `toolkit/src/commands/atomize.ts`, add imports at the top:

```ts
import { parseModelSpec, makeLlmClient } from '../atomize/llm-client.js';
import { distillWithLlm } from '../atomize/distill-llm.js';
import type { DistilledApplyResult } from '../types.js';
```

(`DistilledApplyResult` may already be imported — keep a single import.) Then add the function:

```ts
export async function runDistillLlm(
  vaultDir: string,
  sourcePath: string,
  opts: { model: string; baseUrl?: string; write?: boolean; force?: boolean; env?: NodeJS.ProcessEnv },
): Promise<DistilledApplyResult> {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const spec = parseModelSpec(opts.model);
  if (opts.baseUrl) spec.baseUrl = opts.baseUrl;
  const client = makeLlmClient(spec, opts.env ?? process.env);
  return distillWithLlm(vaultDir, sourcePath, config, client, { write: opts.write, force: opts.force });
}
```

- [ ] **Step 4: Run the wiring test to verify it passes**

Run: `cd toolkit && npx vitest run test/atomize.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the flags into the CLI**

In `toolkit/src/cli.ts`, inside `case 'atomize':`, after the existing flag parsing (after line 118, `const undo = …`) add:

```ts
      const mi = rest.indexOf('--model');
      const model = mi >= 0 ? rest[mi + 1] : undefined;
      const bi = rest.indexOf('--base-url');
      const baseUrl = bi >= 0 ? rest[bi + 1] : undefined;
```

`positional` filters out `--`-prefixed tokens but NOT their values, so exclude the flag values from the source positional. Replace the existing `positional` line with:

```ts
      const flagValues = new Set([model, baseUrl].filter(Boolean) as string[]);
      const positional = rest.filter(a => !a.startsWith('--') && !flagValues.has(a));
```

Then, just before the final `const source = positional[0];` handling (after the `apply` block, before line 132), add the BYO-key branch:

```ts
      if (model) {
        const src = positional[0];
        if (!src) { console.log('Usage: cortex atomize <source.md> --model <provider:model> [--base-url <url>] [--write]'); return 1; }
        console.log(formatDistilledPlan(await runDistillLlm(cwd, src, { model, baseUrl, write, force })));
        return 0;
      }
```

Update the import on line 11 to include `runDistillLlm`:

```ts
import { runAtomize, formatPlan, runEmit, runApply, formatDistilledPlan, runUndo, runDistillLlm } from './commands/atomize.js';
```

- [ ] **Step 6: Update the usage/help text**

In `toolkit/src/cli.ts`, update the `atomize` usage hint string (~line 133) to mention the new mode:

```ts
      if (!source) { console.log('Usage: cortex atomize <source.md> [--emit-json | --write | --model <provider:model> [--base-url <url>]]'); return 1; }
```

- [ ] **Step 7: Build and smoke-test the CLI end to end (dry-run, no network)**

Run: `cd toolkit && npm run build`
Expected: clean `tsc` build (no type errors).

Run: `cd toolkit && node dist/cli.js atomize /nonexistent.md --model anthropic:claude-x` with no `ANTHROPIC_API_KEY` in the env.
Expected: exits with the `Missing ANTHROPIC_API_KEY environment variable` error — proving the flag is parsed and routed before any network call.

- [ ] **Step 8: Update the README**

In `README.md`, in the atomize / commands section, document the no-agent path. Add (adapt to the surrounding style):

```markdown
### Distill without an agent (BYO-key)

Anyone can atomize with their own model — no Claude Code, no MCP client:

    export ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY
    cortex atomize Markdown/spec.md --model anthropic:claude-3-5-sonnet --write

Works with any OpenAI-compatible endpoint too, including a local model:

    cortex atomize Markdown/spec.md --model openai-compat:llama3 --base-url http://localhost:11434/v1 --write

The same distillation methodology drives every path — the Claude `/atomize`
skill, any MCP agent, and this CLI — so notes come out consistent no matter who
distills. Dry-run by default; add `--write` to commit. Every write is reversible
with `cortex undo`.
```

- [ ] **Step 9: Run the full test suite**

Run: `cd toolkit && npm test`
Expected: PASS (all files, no regressions).

- [ ] **Step 10: Commit**

```bash
git add toolkit/src/commands/atomize.ts toolkit/src/cli.ts toolkit/test/atomize.test.ts README.md
git commit -m "feat(atomize): cortex atomize --model — no-agent BYO-key distillation"
```

---

## Verification (whole feature)

- [ ] `cd toolkit && npm test` — every suite green.
- [ ] `cd toolkit && npm run build` — clean build, no type errors.
- [ ] `grep -c "one idea per note" toolkit/skills/atomize/SKILL.md` returns `0` (methodology lives only in `methodology.ts`).
- [ ] **Manual quality parity (out-of-band, needs keys/models):** run `cortex atomize <source> --model anthropic:<model> --write` and `--model openai-compat:<local> --base-url …` on a small vault; confirm the drafts match the quality of a Claude-skill run. Run the previously-flagged **real Copilot-over-MCP** check: register `cortex mcp --write=draft`, have Copilot (agent mode) call `cortex_atomize_emit` → distill → `cortex_atomize_apply`, and confirm it now follows the emitted `instructions`.
- [ ] Open a PR from `feat/portable-distillation`; confirm the README reflects the new command before merge (repo convention).
