import { describe, it, expect, vi, afterEach } from 'vitest';
import { main } from '../src/cli.js';

afterEach(() => vi.restoreAllMocks());

function captureLog(): string[] {
  const out: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.join(' ')); });
  return out;
}

describe('cortex bootstrap (CLI)', () => {
  it('errors with usage when --model is missing', async () => {
    const log = captureLog();
    const code = await main(['bootstrap', '.']);
    expect(code).toBe(1);
    expect(log.join('\n')).toMatch(/Usage: cortex bootstrap/);
  });

  it('surfaces the named env var when the key is missing', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const log = captureLog();
    const code = await main(['bootstrap', '.', '--model', 'anthropic:claude-x']);
    expect(code).toBe(1);
    expect(log.join('\n')).toMatch(/ANTHROPIC_API_KEY/);
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  });
});
