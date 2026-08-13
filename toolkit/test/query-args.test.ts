// The old parser was `rest.filter(a => a !== '--json').join(' ')`: every token
// that was not `--json` became part of the question. So `cortex query "first
// crack" --limit 4` searched for "first crack --limit 4" — the flag text
// polluted the query and the user got silently degraded retrieval instead of an
// error telling them the flag does not exist. That is the failure mode these
// tests exist for, and it is why an unknown flag now throws.
import { describe, it, expect } from 'vitest';
import { parseQueryArgs } from '../src/commands/query.js';

describe('parseQueryArgs', () => {
  it('reads a bare question', () => {
    const a = parseQueryArgs(['what', 'is', 'first', 'crack']);
    expect(a.question).toBe('what is first crack');
    expect(a.json).toBe(false);
    expect(a.limit).toBeUndefined();
    expect(a.content).toBeUndefined();
  });

  it('takes --json anywhere in the line without it reaching the question', () => {
    expect(parseQueryArgs(['--json', 'first', 'crack']).question).toBe('first crack');
    expect(parseQueryArgs(['first', '--json', 'crack']).question).toBe('first crack');
    expect(parseQueryArgs(['first', 'crack', '--json']).json).toBe(true);
  });

  it('rejects an unknown flag instead of searching for it', () => {
    // The regression this file is named after.
    expect(() => parseQueryArgs(['first', 'crack', '--limitt', '4'])).toThrow(/unknown option.*--limitt/i);
    expect(() => parseQueryArgs(['--base-url', 'http://x', 'q'])).toThrow(/unknown option/i);
  });

  it('reads --limit as a positive integer', () => {
    expect(parseQueryArgs(['q', '--limit', '4']).limit).toBe(4);
    expect(parseQueryArgs(['--limit', '1', 'q']).limit).toBe(1);
  });

  it('rejects a --limit that is missing, non-numeric, zero or negative', () => {
    // Each of these used to be indistinguishable from "part of the question".
    expect(() => parseQueryArgs(['q', '--limit'])).toThrow(/--limit needs/i);
    expect(() => parseQueryArgs(['q', '--limit', 'four'])).toThrow(/--limit/i);
    expect(() => parseQueryArgs(['q', '--limit', '0'])).toThrow(/--limit/i);
    expect(() => parseQueryArgs(['q', '--limit', '-2'])).toThrow(/--limit/i);
    expect(() => parseQueryArgs(['q', '--limit', '2.5'])).toThrow(/--limit/i);
  });

  it('reads --full as unbounded content and --max-content as a cap', () => {
    expect(parseQueryArgs(['q', '--full']).content).toBe('full');
    expect(parseQueryArgs(['q', '--max-content', '2000']).content).toBe(2000);
    // 0 is a meaningful cap (ask for the field, want none of it), unlike --limit 0.
    expect(parseQueryArgs(['q', '--max-content', '0']).content).toBe(0);
  });

  it('rejects --full together with --max-content rather than picking one', () => {
    expect(() => parseQueryArgs(['q', '--full', '--max-content', '10'])).toThrow(/--full.*--max-content/i);
    expect(() => parseQueryArgs(['q', '--max-content', '10', '--full'])).toThrow(/--full.*--max-content/i);
  });

  it('treats everything after a bare -- as question text', () => {
    // Without this, a question that legitimately contains flag-looking words
    // becomes unaskable the moment unknown flags start being rejected.
    const a = parseQueryArgs(['--json', '--', 'what', 'does', '--force', 'do']);
    expect(a.question).toBe('what does --force do');
    expect(a.json).toBe(true);
  });

  it('rejects an empty question', () => {
    expect(() => parseQueryArgs(['--json'])).toThrow(/question/i);
    expect(() => parseQueryArgs([])).toThrow(/question/i);
  });

  it('keeps a lone hyphen and negative-looking words in the question', () => {
    expect(parseQueryArgs(['-', 'sign']).question).toBe('- sign');
    expect(parseQueryArgs(['-5', 'degrees']).question).toBe('-5 degrees');
  });
});
