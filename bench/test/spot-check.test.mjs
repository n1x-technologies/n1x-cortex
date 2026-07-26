import { describe, it, expect } from 'vitest';
import { renderSpotCheck } from '../lib/spot-check.mjs';

const questions = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i}`, question: `Question ${i}`, goldPaths: ['a.md'], goldAnswer: `Gold ${i}`, sourceUrl: null,
}));

const verdicts = ['correct', 'incorrect', 'abstained', 'correct', 'correct',
                  'incorrect', 'correct', 'abstained', 'correct', 'incorrect'];

const results = {
  perSystem: {
    cortex: {
      name: 'cortex',
      records: questions.map((q, i) => ({ id: q.id, verdict: verdicts[i], candidate: `Answer ${i}`, tokens: 10 })),
    },
    'grep-agent': {
      name: 'grep-agent',
      records: questions.map((q, i) => ({ id: q.id, verdict: verdicts[verdicts.length - 1 - i], candidate: `Grep answer ${i}`, tokens: 20 })),
    },
  },
};

describe('renderSpotCheck', () => {
  it('emits one section per sampled item', () => {
    const md = renderSpotCheck(results, questions, 6);
    expect((md.match(/^### /gm) || []).length).toBe(6);
  });

  it('includes question, gold answer, candidate and the judge verdict', () => {
    const md = renderSpotCheck(results, questions, 3);
    expect(md).toMatch(/Question 0/);
    expect(md).toMatch(/Gold 0/);
    expect(md).toMatch(/Answer 0/);
    expect(md).toMatch(/judge: `correct`/);
  });

  it('stratifies across verdicts rather than taking the first n', () => {
    const md = renderSpotCheck(results, questions, 3);
    expect(md).toMatch(/judge: `correct`/);
    expect(md).toMatch(/judge: `incorrect`/);
    expect(md).toMatch(/judge: `abstained`/);
  });

  it('leaves a blank human verdict line to fill in', () => {
    const md = renderSpotCheck(results, questions, 2);
    expect((md.match(/human: _{3,}/g) || []).length).toBe(2);
  });

  it('is deterministic across calls', () => {
    expect(renderSpotCheck(results, questions, 5)).toBe(renderSpotCheck(results, questions, 5));
  });

  it('caps the sample at the number of available records', () => {
    const md = renderSpotCheck(results, questions, 99);
    expect((md.match(/^### /gm) || []).length).toBe(10);
  });

  it('defaults to the first system but states plainly which system is sampled', () => {
    const md = renderSpotCheck(results, questions, 3);
    expect(md).toMatch(/Answer \d/); // cortex records, not grep-agent
    expect(md).toMatch(/agreement[^\n]*measures[^\n]*cortex/i);
  });

  it('samples the explicitly requested system, not just the first key', () => {
    const md = renderSpotCheck(results, questions, 3, 'grep-agent');
    expect(md).toMatch(/Grep answer \d/);
    expect(md).not.toMatch(/^\*\*Candidate:\*\* Answer \d/m);
    expect(md).toMatch(/agreement[^\n]*measures[^\n]*grep-agent/i);
  });
});
