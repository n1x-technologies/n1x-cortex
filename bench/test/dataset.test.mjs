import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDataset } from '../lib/dataset.mjs';

let dir, vault, jsonl;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bench-ds-'));
  vault = join(dir, 'vault');
  mkdirSync(join(vault, 'notes'), { recursive: true });
  writeFileSync(join(vault, 'notes', 'a.md'), '# A\n');
  writeFileSync(join(vault, 'notes', 'b.md'), '# B\n');
  jsonl = join(dir, 'q.jsonl');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const rec = (o) => JSON.stringify(o);

describe('loadDataset', () => {
  it('loads valid records', () => {
    writeFileSync(jsonl, [
      rec({ id: 'q1', question: 'What is A?', goldPaths: ['notes/a.md'], goldAnswer: 'A thing.' }),
      rec({ id: 'q2', question: 'What is B?', goldPaths: ['notes/b.md'], goldAnswer: 'B thing.', sourceUrl: 'https://x/1' }),
    ].join('\n'));
    const qs = loadDataset(jsonl, vault);
    expect(qs).toHaveLength(2);
    expect(qs[0].id).toBe('q1');
    expect(qs[0].goldPaths).toEqual(['notes/a.md']);
    expect(qs[0].sourceUrl).toBeNull();
    expect(qs[1].sourceUrl).toBe('https://x/1');
  });

  it('skips blank lines', () => {
    writeFileSync(jsonl, '\n' + rec({ id: 'q1', question: 'Q', goldPaths: ['notes/a.md'], goldAnswer: 'A' }) + '\n\n');
    expect(loadDataset(jsonl, vault)).toHaveLength(1);
  });

  it('rejects a gold path missing from the corpus, naming the id', () => {
    writeFileSync(jsonl, rec({ id: 'q9', question: 'Q', goldPaths: ['notes/ghost.md'], goldAnswer: 'A' }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/q9.*notes\/ghost\.md/s);
  });

  it('rejects a record missing a required field, naming the field', () => {
    writeFileSync(jsonl, rec({ id: 'q1', question: 'Q', goldPaths: ['notes/a.md'] }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/goldAnswer/);
  });

  it('rejects an empty goldPaths array', () => {
    writeFileSync(jsonl, rec({ id: 'q1', question: 'Q', goldPaths: [], goldAnswer: 'A' }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/goldPaths/);
  });

  it('rejects duplicate ids', () => {
    writeFileSync(jsonl, [
      rec({ id: 'dup', question: 'Q', goldPaths: ['notes/a.md'], goldAnswer: 'A' }),
      rec({ id: 'dup', question: 'R', goldPaths: ['notes/b.md'], goldAnswer: 'B' }),
    ].join('\n'));
    expect(() => loadDataset(jsonl, vault)).toThrow(/dup/);
  });

  it('rejects malformed JSON, naming the line number', () => {
    writeFileSync(jsonl, '{not json}');
    expect(() => loadDataset(jsonl, vault)).toThrow(/line 1/);
  });
});
