import { describe, it, expect } from 'vitest';
import { formatQueryJson } from '../src/commands/query.js';
import type { QueryResult } from '../src/types.js';

describe('formatQueryJson', () => {
  it('emits valid JSON that round-trips the structured result', () => {
    const result: QueryResult = {
      question: 'what is the refund rule?',
      anchors: ['refund'],
      hits: [
        { path: '03-Rules/refund.md', id: 'refund', title: 'Refund rule', type: 'rule', score: 0.9, excerpt: 'Refunds within 30 days.', source: 'policy.md', via: 'anchor' },
      ],
      sources: ['policy.md'],
    };
    const json = formatQueryJson(result);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(result);
    expect(parsed.hits[0].path).toBe('03-Rules/refund.md');
    expect(parsed.sources).toEqual(['policy.md']);
  });

  it('round-trips an empty result', () => {
    const empty: QueryResult = { question: 'x', anchors: [], hits: [], sources: [] };
    expect(JSON.parse(formatQueryJson(empty))).toEqual(empty);
  });
});
