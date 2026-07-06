import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDistillPrompt, parseDistilledResponse, distillWithLlm, distillWorksheetWithLlm } from '../src/atomize/distill-llm.js';
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

describe('distillWorksheetWithLlm', () => {
  it('distills a prebuilt worksheet and honors the passed runId + dry-run default', async () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const worksheet = emitPlan(dir, join(dir, 'Markdown', 'src.md'), cfg);
    const client = fakeClient(JSON.stringify({ source: 'ignored', notes: [cannedNote] }));
    const res = await distillWorksheetWithLlm(dir, worksheet, cfg, client, { write: true, runId: 'run-fixed-1' });
    expect(res.plan.dryRun).toBe(false);
    expect(res.written.length).toBeGreaterThan(0);
  });
  it('defaults to dry-run when write is omitted', async () => {
    const dir = vault();
    const cfg = loadConfig(dir, []);
    const worksheet = emitPlan(dir, join(dir, 'Markdown', 'src.md'), cfg);
    const res = await distillWorksheetWithLlm(dir, worksheet, cfg, fakeClient(JSON.stringify({ source: 'x', notes: [cannedNote] })));
    expect(res.plan.dryRun).toBe(true);
    expect(res.written).toHaveLength(0);
  });
});
