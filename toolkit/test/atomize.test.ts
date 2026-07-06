import { describe, it, expect } from 'vitest';
import { runAtomize, formatPlan } from '../src/commands/atomize.js';
import { runEmit, runApply, formatDistilledPlan, runUndo, runDistillLlm } from '../src/commands/atomize.js';
import { runPromote, formatPromote, runSetStatus } from '../src/commands/promote.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function vault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-acmd-'));
  mkdirSync(join(dir, 'Markdown'));
  writeFileSync(join(dir, 'Markdown', 'rules.md'), '# Rules\n\n## Operation limit\n\nThe limit is 5.');
  return dir;
}

describe('runAtomize', () => {
  it('dry-runs by default (writes nothing) and reports the plan', () => {
    const dir = vault();
    const r = runAtomize(dir, join(dir, 'Markdown', 'rules.md'), {});
    expect(r.plan.dryRun).toBe(true);
    expect(r.written).toEqual([]);
    expect(existsSync(join(dir, '_inbox', 'operation-limit.md'))).toBe(false);
    expect(formatPlan(r)).toMatch(/dry-run|create/i);
  });
  it('writes draft notes with --write', () => {
    const dir = vault();
    const r = runAtomize(dir, join(dir, 'Markdown', 'rules.md'), { write: true });
    expect(r.written.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, '_inbox', 'operation-limit.md'))).toBe(true);
  });
});

describe('runEmit / runApply (atomize 3.1)', () => {
  it('runEmit prints valid JSON with segments and discovered context', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-emit-cmd-'));
    mkdirSync(join(dir, 'Markdown'));
    mkdirSync(join(dir, '03-Rules'));
    writeFileSync(join(dir, '03-Rules', 'r.md'), '---\ntype: rule\n---\n# Existing rule');
    writeFileSync(join(dir, 'Markdown', 'src.md'), '# Src\n\n## Topic A\n\nBody A.');
    const json = JSON.parse(runEmit(dir, join(dir, 'Markdown', 'src.md')));
    expect(json.source).toBe('src');
    expect(json.knownTypes).toContain('rule');
    expect(json.knownFolders).toContain('03-Rules');
    expect(json.segments.map((s: { heading: string }) => s.heading)).toContain('Topic A');
  });

  it('runApply dry-runs by default (writes nothing) and writes with --write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-apply-cmd-'));
    mkdirSync(join(dir, 'Markdown'));
    writeFileSync(join(dir, 'Markdown', 'src.md'), '# ignored');
    const specs = join(dir, 'd.json');
    writeFileSync(specs, JSON.stringify({ source: 'src', notes: [{ title: 'Operation limit', type: 'rule', folder: '03-Rules', body: 'B.' }] }));

    const dry = runApply(dir, specs, {});
    expect(dry.written).toEqual([]);
    expect(existsSync(join(dir, '_inbox'))).toBe(false);
    expect(formatDistilledPlan(dry)).toMatch(/dry-run|create/i);

    const wet = runApply(dir, specs, { write: true });
    expect(wet.written).toContain('_inbox/03-Rules/operation-limit.md');
    expect(existsSync(join(dir, '_inbox/03-Rules/operation-limit.md'))).toBe(true);
  });
});

describe('runApply update + runUndo', () => {
  it('applies an update with --write and undoes it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-updcmd-'));
    mkdirSync(join(dir, '01-Concepts'));
    const note = join(dir, '01-Concepts', 'n.md');
    writeFileSync(note, '---\ntype: concept\nid: n\n---\n# N\n\norig body long enough\n');
    const specs = join(dir, 'd.json');
    writeFileSync(specs, JSON.stringify({ source: 'src', notes: [
      { title: 'N', action: 'update', targetPath: '01-Concepts/n.md', body: '# N\n\norig body long enough, plus new info added' },
    ]}));

    const r = runApply(dir, specs, { write: true });
    expect(r.updated).toEqual(['01-Concepts/n.md']);
    expect(readFileSync(note, 'utf8')).toContain('plus new info added');
    expect(formatDistilledPlan(r)).toMatch(/update →/);

    const undo = runUndo(dir);
    expect(undo.restored).toEqual(['01-Concepts/n.md']);
    expect(readFileSync(note, 'utf8')).toContain('orig body long enough');
    expect(readFileSync(note, 'utf8')).not.toContain('plus new info added');
  });
});

describe('runSetStatus + runPromote + runUndo (3.3)', () => {
  it('advances status, promotes, and undoes the promotion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-prcmd-'));
    mkdirSync(join(dir, '01-Concepts'));
    mkdirSync(join(dir, '_inbox', '01-Concepts'), { recursive: true });
    const inbox = join(dir, '_inbox', '01-Concepts', 'n.md');
    writeFileSync(inbox, '---\ntype: concept\nid: n\nstatus: "draft"\n---\n# N\n\nbody');

    // not ready yet → promote skips it
    expect(runPromote(dir, { write: true }).promoted).toEqual([]);

    // advance status, then promote
    expect(runSetStatus(dir, '_inbox/01-Concepts/n.md', 'documented', { write: true }).changed).toBe('_inbox/01-Concepts/n.md');
    const r = runPromote(dir, { write: true });
    expect(r.promoted).toEqual([{ from: '_inbox/01-Concepts/n.md', to: '01-Concepts/n.md' }]);
    expect(existsSync(join(dir, '01-Concepts', 'n.md'))).toBe(true);
    expect(formatPromote(r)).toMatch(/→ 01-Concepts\/n\.md/);

    // undo the promotion → note returns to _inbox
    const u = runUndo(dir);
    expect(u.reverted).toEqual(['_inbox/01-Concepts/n.md']);
    expect(existsSync(inbox)).toBe(true);
    expect(existsSync(join(dir, '01-Concepts', 'n.md'))).toBe(false);
  });
});

describe('runDistillLlm (BYO-key CLI wiring)', () => {
  it('surfaces the named env var when the key is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-byok-'));
    mkdirSync(join(dir, 'Markdown'));
    writeFileSync(join(dir, 'Markdown', 'src.md'), '# S\n\n## A\n\nBody.');
    await expect(
      runDistillLlm(dir, join(dir, 'Markdown', 'src.md'), { model: 'anthropic:claude-x', env: {} as NodeJS.ProcessEnv }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});
