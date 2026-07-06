// toolkit/test/cli-help.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { main } from '../src/cli.js';

function captureLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...a) => { lines.push(a.join(' ')); });
  return { lines, restore: () => spy.mockRestore() };
}

afterEach(() => vi.restoreAllMocks());

describe('cli --version / --help', () => {
  it('--version prints the package version and exits 0', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['--version']);
    restore();
    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help prints usage and exits 0', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['--help']);
    restore();
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Usage: cortex');
  });

  it('no command prints usage and exits 0', async () => {
    const { lines, restore } = captureLog();
    const code = await main([]);
    restore();
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Usage: cortex');
  });

  it('unknown command prints usage and exits 1', async () => {
    const { restore } = captureLog();
    const code = await main(['bogus']);
    restore();
    expect(code).toBe(1);
  });

  // Regression guard: a bare trailing `--model` (no value) must error, not silently
  // fall through to the plain local dry-run atomize path.
  it('atomize --model with no value errors and exits 1 without distilling', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['atomize', 'somesource.md', '--model']);
    restore();
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('Usage: cortex atomize');
  });

  // Regression guard: `cortex mcp --help` must NOT start the stdio server (which hangs).
  it('mcp --help prints MCP help and exits 0 without hanging', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['mcp', '--help']);
    restore();
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('cortex mcp install');
  });

  it('mcp help (subcommand form) prints MCP help and exits 0', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['mcp', 'help']);
    restore();
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('cortex mcp install');
  });
});

describe('per-command --help does not execute the command', () => {
  // Before the fix, `--help` on a command that needs no positional args (init,
  // viz, embed) fell through to the command body and mutated state / hung.
  // Proof-by-output: the interceptor returns the usage text BEFORE the switch,
  // so the command's own run output ("Created .cortex.json", store counts, a
  // running server) never appears — which also means no side effect ran.
  it('init --help prints init help, not the init run output', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['init', '--help']);
    restore();
    const out = lines.join('\n');
    expect(code).toBe(0);
    expect(out).toContain('Usage: cortex init');
    expect(out).not.toMatch(/Created \.cortex\.json|already exists/);
  });

  it('viz --help prints viz help and exits 0 without starting a server', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['viz', '--help']);
    restore();
    const out = lines.join('\n');
    expect(code).toBe(0);
    expect(out).toContain('Usage: cortex viz');
    expect(out).toContain('--port');
    expect(out).not.toContain('Cortex viewer running');
  });

  it('embed --help prints embed help, not the embed run output', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['embed', '--help']);
    restore();
    const out = lines.join('\n');
    expect(code).toBe(0);
    expect(out).toContain('Usage: cortex embed');
    expect(out).not.toMatch(/store:.*notes/);
  });

  it('-h works as an alias (query -h prints query help, runs no query)', async () => {
    const { lines, restore } = captureLog();
    const code = await main(['query', '-h']);
    restore();
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Usage: cortex query');
  });
});
