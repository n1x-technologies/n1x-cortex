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
    if (spec.baseUrl) throw new Error('anthropic provider ignores --base-url; use an openai-compat model for a custom endpoint');
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
