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
