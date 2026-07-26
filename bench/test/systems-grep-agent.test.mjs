import { describe, it, expect } from 'vitest';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, name, parseAction, executeTool, MAX_TURNS } from '../lib/systems/grep-agent.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const VAULT = resolve(here, '../fixtures/ci-vault');

describe('parseAction', () => {
  it('parses a grep action', () => {
    expect(parseAction('GREP: first crack')).toEqual({ tool: 'grep', arg: 'first crack' });
  });
  it('parses a read action', () => {
    expect(parseAction('READ: notes/first-crack.md')).toEqual({ tool: 'read', arg: 'notes/first-crack.md' });
  });
  it('parses a list action with an empty argument', () => {
    expect(parseAction('LIST:')).toEqual({ tool: 'list', arg: '' });
  });
  it('parses a final answer', () => {
    expect(parseAction('ANSWER: 196 C')).toEqual({ tool: 'answer', arg: '196 C' });
  });
  it('ignores prose before the action line', () => {
    expect(parseAction('Let me look.\nGREP: crack')).toEqual({ tool: 'grep', arg: 'crack' });
  });
  it('returns null when no action is present', () => {
    expect(parseAction('I am thinking about it')).toBeNull();
  });
});

describe('executeTool', () => {
  it('lists exactly the vault-relative markdown paths, excluding backend state and templates', () => {
    const out = executeTool('list', '', VAULT);
    const paths = out.split('\n').filter(Boolean);
    expect(out).toMatch(/notes\/first-crack\.md/);
    expect(out).not.toMatch(/\.cortex/);
    // Resolution 1: the fixture vault's `_templates/note.md` scaffold must be
    // excluded, same as every Cortex system's scanVault sees — a baseline that
    // scans a different corpus than the systems it's compared against is a
    // fairness bug. A loose substring match let this slip through twice
    // before, so this asserts the exact listed count instead.
    expect(out).not.toMatch(/_templates/);
    expect(paths).toHaveLength(12);
  });
  it('greps note contents and reports the matching path', () => {
    const out = executeTool('grep', '196', VAULT);
    expect(out).toMatch(/notes\/first-crack\.md/);
  });
  it('reads a note by vault-relative path', () => {
    expect(executeTool('read', 'notes/first-crack.md', VAULT)).toMatch(/196/);
  });
  it('refuses to escape the vault', () => {
    expect(executeTool('read', '../../../etc/passwd', VAULT)).toMatch(/outside the vault/i);
  });
  it('refuses to escape into a sibling directory whose name merely starts with the vault name', () => {
    // Resolution 4: `abs.startsWith(resolve(vaultDir))` is a string-prefix
    // check, so a sibling directory like `ci-vault-evil` (which starts with
    // the vault dir name `ci-vault`) would incorrectly pass the old guard.
    // The fixed guard must reject based on path structure (relative() giving
    // a `..`-prefixed or absolute result), not string prefix.
    const evilArg = '../' + basename(VAULT) + '-evil/secret.md';
    expect(executeTool('read', evilArg, VAULT)).toMatch(/outside the vault/i);
  });
  it('reports no matches rather than throwing', () => {
    expect(executeTool('grep', 'zzzznotpresent', VAULT)).toMatch(/no matches/i);
  });
});

describe('grep-agent', () => {
  it('exports the contract name', () => expect(name).toBe('grep-agent'));

  it('accumulates cited paths and retrieval tokens across turns', async () => {
    const replies = [
      'GREP: 196',
      'READ: notes/first-crack.md',
      'ANSWER: First crack is around 196 C.',
    ];
    let i = 0;
    const llm = { async complete() { return replies[i++]; } };

    const r = await run('At what temperature does first crack occur?', { vaultDir: VAULT, llm });
    expect(r.citedPaths).toContain('notes/first-crack.md');
    expect(r.promptPayload).toMatch(/196/);
    expect(r.retrievalTokens).toBeGreaterThan(0);
    expect(i).toBe(3);
  });

  it('costs strictly more the longer the agent takes to answer — accumulation, not a snapshot', async () => {
    // Resolution 3: `toBeGreaterThan(0)` alone passes even if `run()` only
    // counted the first turn and never accumulated across the loop — the
    // exact property this test's name claims. Both scenarios end on the
    // IDENTICAL final answer string on purpose: if retrievalTokens were an
    // assignment (last-turn snapshot) instead of a running `+=`, both runs
    // would end up counting only that shared final reply and land EQUAL,
    // not strictly greater — so this only passes under real accumulation.
    const FINAL = 'ANSWER: First crack is around 196 C.';
    const oneTurnLlm = { async complete() { return FINAL; } };
    let call = 0;
    const threeTurnReplies = ['GREP: 196', 'GREP: crack', FINAL];
    const threeTurnLlm = { async complete() { return threeTurnReplies[call++]; } };

    const oneTurn = await run('At what temperature does first crack occur?', { vaultDir: VAULT, llm: oneTurnLlm });
    const threeTurn = await run('At what temperature does first crack occur?', { vaultDir: VAULT, llm: threeTurnLlm });

    expect(call).toBe(3);
    expect(threeTurn.retrievalTokens).toBeGreaterThan(oneTurn.retrievalTokens);
  });

  it('stops at the turn cap when the model never answers', async () => {
    let calls = 0;
    const llm = { async complete() { calls++; return 'GREP: crack'; } };
    const r = await run('Q', { vaultDir: VAULT, llm });
    expect(calls).toBe(MAX_TURNS);
    expect(r.retrievalTokens).toBeGreaterThan(0);
  });

  it('stops when the model emits an unparseable turn', async () => {
    let calls = 0;
    const llm = { async complete() { calls++; return 'I give up'; } };
    await run('Q', { vaultDir: VAULT, llm });
    expect(calls).toBe(1);
  });
});
