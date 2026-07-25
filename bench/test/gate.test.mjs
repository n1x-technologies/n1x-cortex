import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkGate, checkCacheCompleteness } from '../lib/gate.mjs';

const baseline = {
  perSystem: {
    cortex: { recallAt5: 0.9, medianTokens: 1000 },
  },
};
const results = (recallAt5, medianTokens) => ({
  perSystem: { cortex: { name: 'cortex', recallAt5, medianTokens, errors: [] } },
});

describe('checkGate', () => {
  it('passes when nothing moved', () => {
    expect(checkGate(results(0.9, 1000), baseline).pass).toBe(true);
  });

  it('passes on improvement', () => {
    expect(checkGate(results(0.95, 800), baseline).pass).toBe(true);
  });

  it('tolerates a drop within 2 points', () => {
    expect(checkGate(results(0.885, 1000), baseline).pass).toBe(true);
  });

  it('fails on a recall drop beyond 2 points', () => {
    const r = checkGate(results(0.87, 1000), baseline);
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toMatch(/recall@5/);
  });

  it('tolerates a token rise within 10%', () => {
    expect(checkGate(results(0.9, 1100), baseline).pass).toBe(true);
  });

  it('fails on a token rise beyond 10%', () => {
    const r = checkGate(results(0.9, 1101), baseline);
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toMatch(/tokens/);
  });

  it('fails when a baselined system is missing from the results', () => {
    const r = checkGate({ perSystem: {} }, baseline);
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toMatch(/cortex/);
  });

  it('fails when any system errored on any question', () => {
    const r = checkGate(
      { perSystem: { cortex: { name: 'cortex', recallAt5: 0.9, medianTokens: 1000, errors: [{ id: 'q1', message: 'boom' }] } } },
      baseline,
    );
    expect(r.pass).toBe(false);
    expect(r.failures.some(f => /error/i.test(f))).toBe(true);
  });

  it('reports every failure, not just the first', () => {
    const r = checkGate(results(0.5, 5000), baseline);
    expect(r.failures.length).toBe(2);
  });
});

describe('checkCacheCompleteness', () => {
  let dir, cachePath;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const questions = [
    { id: 'q1', question: 'What is the house target development time ratio?' },
    { id: 'q2', question: 'At what temperature does first crack occur?' },
  ];

  function writeCache(vectors) {
    dir = mkdtempSync(join(tmpdir(), 'gate-cache-'));
    cachePath = join(dir, 'query-vectors.json');
    writeFileSync(cachePath, JSON.stringify({ model: 'm', dim: 3, vectors }));
    return cachePath;
  }

  it('returns no failures when every question has a cached vector', () => {
    const p = writeCache({
      'What is the house target development time ratio?': [1, 0, 0],
      'At what temperature does first crack occur?': [0, 1, 0],
    });
    expect(checkCacheCompleteness(questions, p)).toEqual([]);
  });

  it('matches cache keys that carry a query:/passage: prefix', () => {
    const p = writeCache({
      'query: What is the house target development time ratio?': [1, 0, 0],
      'passage: At what temperature does first crack occur?': [0, 1, 0],
    });
    expect(checkCacheCompleteness(questions, p)).toEqual([]);
  });

  it('reports a failure naming the missing question when a vector is absent', () => {
    const p = writeCache({
      'What is the house target development time ratio?': [1, 0, 0],
    });
    const failures = checkCacheCompleteness(questions, p);
    expect(failures.length).toBe(1);
    expect(failures[0]).toMatch(/q2/);
    expect(failures[0]).toMatch(/At what temperature does first crack occur\?/);
    expect(failures[0]).toMatch(/build-fixture-embeddings\.mjs/);
  });

  it('reports one failure per missing question, not just the first', () => {
    const p = writeCache({});
    const failures = checkCacheCompleteness(questions, p);
    expect(failures.length).toBe(2);
  });
});
