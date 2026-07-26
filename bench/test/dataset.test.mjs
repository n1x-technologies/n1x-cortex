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

  // Trap membership is DECLARED, never inferred, so the declaration has to
  // survive a hand edit. `answerable !== false` read any non-false value as
  // answerable: the string "false" — what a spreadsheet or CSV export produces
  // — sent the record down the answerable branch, where it failed with
  // `missing required field "goldAnswer"` and told the author to invent an
  // answer for a question the corpus cannot answer.
  it('rejects a non-boolean answerable, naming the right field', () => {
    for (const bad of ['false', 'no', 0, null, 1]) {
      writeFileSync(jsonl, rec({
        id: 't1', question: 'T', answerable: bad, nearMissPaths: ['notes/a.md'],
      }));
      expect(() => loadDataset(jsonl, vault)).toThrow(/"answerable" must be a boolean/);
    }
  });

  it('does not let a half-edited trap load as an answerable question', () => {
    // The dangerous shape: answerable stringified AND a leftover goldAnswer, so
    // every answerable-branch requirement is satisfied and the trap silently
    // becomes a scored answerable question.
    writeFileSync(jsonl, rec({
      id: 't1', question: 'T', answerable: 'false',
      goldAnswer: 'leftover', goldPaths: ['notes/a.md'],
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/"answerable" must be a boolean/);
  });

  // These two are the commonest JSONL hand-edit slip: a single path written as
  // a bare string instead of a one-element array. An Array.isArray guard reads
  // it as "field absent" and the record loads clean with the field discarded —
  // producing exactly the ambiguous state the guard exists to reject.
  it('rejects a trap carrying goldPaths as a bare string', () => {
    writeFileSync(jsonl, rec({
      id: 't1', question: 'T', answerable: false,
      goldPaths: 'notes/a.md', nearMissPaths: ['notes/a.md'],
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/must not carry "goldPaths"/);
  });

  it('rejects an answerable question carrying nearMissPaths as a bare string', () => {
    writeFileSync(jsonl, rec({
      id: 'a1', question: 'Q', goldPaths: ['notes/a.md'], goldAnswer: 'A',
      nearMissPaths: 'notes/b.md',
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/"nearMissPaths" belongs to a trap question/);
  });

  it('accepts an explicitly empty array on the branch that must not carry it', () => {
    // `"goldPaths": []` on a trap is not a half-edit — it is the field written
    // out in its unused form, and rejecting it would fail records the loader
    // itself emits.
    writeFileSync(jsonl, rec({
      id: 't1', question: 'T', answerable: false,
      goldPaths: [], nearMissPaths: ['notes/a.md'],
    }));
    expect(loadDataset(jsonl, vault)).toHaveLength(1);
  });

  it('rejects a trap whose nearMissPaths is an empty array', () => {
    // Distinct from the key being absent, and reachable only through this
    // shape: metrics.mjs scores an empty target set as 0, so such a trap would
    // contribute a hard zero for every system while still incrementing the
    // denominator — a dataset error presenting as a retrieval regression.
    writeFileSync(jsonl, rec({ id: 't1', question: 'T', answerable: false, nearMissPaths: [] }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/requires a non-empty "nearMissPaths"/);
  });

  it('rejects an empty string or a directory as a path', () => {
    // existsSync(join(vault, '')) tests the vault root, which exists — so an
    // empty element passes an existence-only check and then never matches a
    // cited path.
    writeFileSync(jsonl, rec({ id: 't1', question: 'T', answerable: false, nearMissPaths: [''] }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/nearMissPath is an empty string/);

    writeFileSync(jsonl, rec({ id: 't2', question: 'T', answerable: false, nearMissPaths: ['notes'] }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/nearMissPath "notes" is not a file/);
  });

  it('rejects a non-canonical path that would validate and then never match', () => {
    // join() normalises before the existence check, so these all exist. But
    // citedPaths are matched by exact string equality, so each contributes a
    // permanent 0 and CI reports a multi-system retrieval regression.
    for (const p of ['./notes/a.md', 'notes//a.md', 'notes/../notes/a.md']) {
      writeFileSync(jsonl, rec({ id: 'a1', question: 'Q', goldPaths: [p], goldAnswer: 'A' }));
      expect(() => loadDataset(jsonl, vault), p).toThrow(/is not a canonical vault-relative path/);
    }
  });

  it('rejects a path that escapes the vault', () => {
    for (const p of ['../outside.md', '/etc/passwd']) {
      writeFileSync(jsonl, rec({ id: 'a1', question: 'Q', goldPaths: [p], goldAnswer: 'A' }));
      expect(() => loadDataset(jsonl, vault), p).toThrow(/is not a canonical vault-relative path/);
    }
  });

  // The canonical checks are string tests, and macOS matches paths
  // case-insensitively, so a wrongly-cased path satisfies both normalize() and
  // existsSync() and then matches no citedPath — the exact defect the check
  // was added for, arriving by a different route.
  it('rejects a path whose case does not match the file on disk', () => {
    writeFileSync(jsonl, rec({
      id: 'a1', question: 'Q', goldPaths: ['notes/A.md'], goldAnswer: 'A',
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/does not match the file on disk.*notes\/a\.md/s);
  });

  it('accepts a real file whose name begins with dots', () => {
    // `..` must be a path-segment test: `startsWith('..')` rejected a genuine
    // `..hidden.md` and told the author to write what they already wrote.
    writeFileSync(join(vault, '..hidden.md'), '# H\n');
    writeFileSync(jsonl, rec({
      id: 'a1', question: 'Q', goldPaths: ['..hidden.md'], goldAnswer: 'A',
    }));
    expect(loadDataset(jsonl, vault)[0].goldPaths).toEqual(['..hidden.md']);
  });

  it('still accepts an ordinary nested path', () => {
    mkdirSync(join(vault, 'notes', 'sub'), { recursive: true });
    writeFileSync(join(vault, 'notes', 'sub', 'deep.md'), '# D\n');
    writeFileSync(jsonl, rec({
      id: 'a1', question: 'Q', goldPaths: ['notes/sub/deep.md'], goldAnswer: 'A',
    }));
    expect(loadDataset(jsonl, vault)[0].goldPaths).toEqual(['notes/sub/deep.md']);
  });

  it('reports a non-string path with the file, line and question id', () => {
    writeFileSync(jsonl, rec({
      id: 'a1', question: 'Q', goldPaths: ['notes/a.md', 123], goldAnswer: 'A',
    }));
    expect(() => loadDataset(jsonl, vault)).toThrow(/a1.*goldPath must be a string, got number/s);
  });

  it('rejects a non-string id rather than letting 1 and "1" both load', () => {
    writeFileSync(jsonl, [
      rec({ id: 1, question: 'Q', goldPaths: ['notes/a.md'], goldAnswer: 'A' }),
    ].join('\n'));
    expect(() => loadDataset(jsonl, vault)).toThrow(/"id" must be a string, got number/);
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
