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

  // ---- trap questions ----
  // A trap has no gold answer, so the human labelling the sample needs the
  // near-miss notes instead: the question looks answerable, and those notes
  // are what the system was actually shown. Without them there is no way to
  // judge whether declining was right.
  const trapQuestions = [
    ...questions,
    { id: 'tA', question: 'Trap A', goldPaths: [], goldAnswer: null, sourceUrl: null,
      answerable: false, nearMissPaths: ['notes/drum-temperature.md'] },
    { id: 'tB', question: 'Trap B', goldPaths: [], goldAnswer: null, sourceUrl: null,
      answerable: false, nearMissPaths: ['notes/grind-size.md'] },
  ];
  const withTraps = {
    perSystem: {
      cortex: {
        name: 'cortex',
        records: [
          ...results.perSystem.cortex.records.map(r => ({ ...r, answerable: true })),
          { id: 'tA', answerable: false, verdict: 'declined', candidate: 'No idea.', tokens: 10 },
          { id: 'tB', answerable: false, verdict: 'invented', candidate: 'About 50.', tokens: 10 },
        ],
      },
    },
  };

  it('renders the near-miss notes instead of a gold answer for a trap', () => {
    const md = renderSpotCheck(withTraps, trapQuestions, 30);
    expect(md).toMatch(/### tB/);
    expect(md).toMatch(/\*\*Near-miss notes:\*\*.*notes\/grind-size\.md/);
    // A trap has no gold answer; printing "undefined" would be worse than
    // useless to the person labelling it.
    expect(md).not.toMatch(/\*\*Gold answer:\*\* *(undefined|null)/);
  });

  it('stratifies across the trap verdicts as well as the answerable ones', () => {
    const md = renderSpotCheck(withTraps, trapQuestions, 5);
    expect(md).toMatch(/judge: `declined`/);
    expect(md).toMatch(/judge: `invented`/);
  });

  it('tells the human which labels are valid for a trap', () => {
    const md = renderSpotCheck(withTraps, trapQuestions, 30);
    expect(md).toMatch(/declined \/ invented/);
  });

  it('marks a trap section so the labeller knows declining is the correct answer', () => {
    const md = renderSpotCheck(withTraps, trapQuestions, 30);
    expect(md).toMatch(/corpus does not answer this/i);
  });

});
