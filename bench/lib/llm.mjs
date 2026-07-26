// Reuses the toolkit's existing BYO-key client rather than adding an SDK.
// Spec format is provider:model, e.g. anthropic:claude-sonnet-5,
// openai-compat:llama3.1:latest. Keys come from the environment, never flags.
import { makeLlmClient, parseModelSpec } from '../../toolkit/dist/atomize/llm-client.js';

/**
 * @param {string} spec  e.g. "anthropic:claude-sonnet-5"
 * @param {string} [baseUrl]  required for openai-compat
 * @returns {{ complete(system: string, user: string): Promise<string> }}
 */
export function makeLlm(spec, baseUrl) {
  const parsed = parseModelSpec(spec);
  if (baseUrl) parsed.baseUrl = baseUrl;
  return makeLlmClient(parsed, process.env);
}
