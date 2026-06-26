// toolkit/test/hook-handlers.test.ts
import { describe, it, expect } from 'vitest';
import { onSessionStart, onStop, onPostToolUse, onUserPromptSubmit, looksLikeDomainQuestion, onSessionEnd } from '../src/hooks/handlers.js';
import { freshState } from '../src/hooks/state.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-hh-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'a.md'), '# Source A');
  mkdirSync(join(dir, '01-Notes'));
  writeFileSync(join(dir, '01-Notes', 'n.md'), '---\nstatus: "draft"\n---\n# A note');
  return dir;
}

describe('onSessionStart', () => {
  it('injects a one-line status and snapshots sources', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const { state, response } = onSessionStart({}, dir, cfg, freshState());
    expect(state.sources['Markdown/a.md']).toBeGreaterThan(0);
    expect(response.hookSpecificOutput?.additionalContext).toMatch(/Cortex: 1 notes/);
  });
  it('is a silent no-op when paused', () => {
    const dir = vault();
    const r = onSessionStart({}, dir, loadConfig(dir, []), { ...freshState(), paused: true });
    expect(r.response).toEqual({});
  });
});

describe('onStop', () => {
  it('suggests /atomize when a source changed, and writes no notes', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const before = readdirSync(join(dir, '01-Notes')).length;
    // snapshot is empty in freshState → the existing source counts as dirty
    const { state, response } = onStop({}, dir, cfg, freshState());
    expect(response.systemMessage).toMatch(/run \/atomize/);
    expect(state.dirty).toEqual([]);                                  // cleared after announcing
    expect(readdirSync(join(dir, '01-Notes')).length).toBe(before);   // no note written
  });
  it('is silent when nothing changed', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const seeded = onStop({}, dir, cfg, freshState()).state;          // announce + clear
    const { response } = onStop({}, dir, cfg, seeded);                // snapshot now current
    expect(response).toEqual({});
  });
});

describe('onPostToolUse', () => {
  it('marks a sourcesDir .md path dirty', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const payload = { tool_input: { file_path: join(dir, 'Markdown', 'a.md') } };
    const { state } = onPostToolUse(payload, dir, cfg, freshState());
    expect(state.dirty).toEqual(['Markdown/a.md']);
  });
  it('ignores paths outside sourcesDir', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const payload = { tool_input: { file_path: join(dir, '01-Notes', 'n.md') } };
    const { state } = onPostToolUse(payload, dir, cfg, freshState());
    expect(state.dirty).toEqual([]);
  });
});

describe('onUserPromptSubmit', () => {
  it('detects domain-like questions', () => {
    expect(looksLikeDomainQuestion('What is the refund rule?')).toBe(true);
    expect(looksLikeDomainQuestion('ok thanks')).toBe(false);
  });
  it('injects grounding for a question and nothing for chatter', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const q = onUserPromptSubmit({ prompt: 'What does note n say?' }, dir, cfg, freshState());
    expect(q.response.hookSpecificOutput?.additionalContext).toBeTypeOf('string');
    expect(q.state.session.injectedTokens).toBeGreaterThan(0);
    const chat = onUserPromptSubmit({ prompt: 'ok' }, dir, cfg, freshState());
    expect(chat.response).toEqual({});
  });
  it('injects nothing once the token cap is exceeded', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const capped = { ...freshState(), session: { injectedTokens: 99999 } };
    const r = onUserPromptSubmit({ prompt: 'What is X?' }, dir, cfg, capped);
    expect(r.response).toEqual({});
  });
});

describe('onSessionEnd', () => {
  it('digests outstanding dirty sources and resets the token budget', () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const seeded = { ...freshState(), session: { injectedTokens: 1234 } };  // empty snapshot → a.md is dirty
    const { state, response } = onSessionEnd({}, dir, cfg, seeded);
    expect(response.systemMessage).toMatch(/still need atomizing/);
    expect(state.session.injectedTokens).toBe(0);
  });
});
