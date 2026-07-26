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
    // The bad record sits on line 2 (line 1 is a valid record) so this test
    // actually discriminates: V8's native SyntaxError also happens to say
    // "line 1" for line-1 input, so a line-1 fixture would pass even with
    // the try/catch that produces this message removed entirely.
    writeFileSync(jsonl, [
      rec({ id: 'q1', question: 'Q', goldPaths: ['notes/a.md'], goldAnswer: 'A' }),
      '{not json}',
    ].join('\n'));
    expect(() => loadDataset(jsonl, vault)).toThrow(/line 2/);
  });

  it('loads a trap question with answerable:false and nearMissPaths', () => {
    writeFileSync(jsonl, rec({
      id: 't1', question: 'What is the ideal drum RPM?',
      answerable: false, nearMissPaths: ['notes/a.md'],
    }));
    const [q] = loadDataset(jsonl, vault);
    expect(q.answerable).toBe(false);
    expect(q.nearMissPaths).toEqual(['notes/a.md']);
    expect(q.goldPaths).toEqual([]);
    expect(q.goldAnswer).toBeNull();
  });

  it('defaults answerable to true and nearMissPaths to empty', () => {
    writeFileSync(jsonl, rec({ id: 'a1', question: 'Q', goldPaths: ['notes/a.md'], goldAnswer: 'A' }));
    const [q] = loadDataset(jsonl, vault);
    expect(q.answerable).toBe(true);
    expect(q.nearMissPaths).toEqual([]);
  });

  it('loads a file mixing answerable and trap questions', () => {
    writeFileSync(jsonl, [
      rec({ id: 'a1', question: 'Q', goldPaths: ['notes/a.md'], goldAnswer: 'A' }),
      rec({ id: 't1', question: 'T', answerable: false, nearMissPaths: ['notes/b.md'] }),
    ].join('\n'));
    const qs = loadDataset(jsonl, vault);
    expect(qs.map(q => q.answerable)).toEqual([true, false]);
  });

  it('rejects a trap that still carries a goldAnswer', () => {
    writeFileSync(jsonl, rec({
      id: 't2', question: 'T', answerable: false,
      nearMissPaths: ['notes/a.md'], goldAnswer: 'leftover',
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/t2.*goldAnswer/s);
  });

  it('rejects a trap that still carries goldPaths', () => {
    writeFileSync(jsonl, rec({
      id: 't3', question: 'T', answerable: false,
      nearMissPaths: ['notes/a.md'], goldPaths: ['notes/a.md'],
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/t3.*goldPaths/s);
  });

  it('rejects a trap with no nearMissPaths', () => {
    writeFileSync(jsonl, rec({ id: 't4', question: 'T', answerable: false }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/t4.*nearMissPaths/s);
  });

  it('rejects a trap whose nearMissPath is not in the corpus', () => {
    writeFileSync(jsonl, rec({
      id: 't5', question: 'T', answerable: false, nearMissPaths: ['notes/ghost.md'],
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/t5.*nearMissPath "notes\/ghost\.md"/s);
  });

  it('rejects an answerable question carrying nearMissPaths', () => {
    writeFileSync(jsonl, rec({
      id: 'a2', question: 'Q', goldPaths: ['notes/a.md'], goldAnswer: 'A',
      nearMissPaths: ['notes/b.md'],
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/a2.*nearMissPaths/s);
  });
});
