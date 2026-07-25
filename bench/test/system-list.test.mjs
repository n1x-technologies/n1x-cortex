import { describe, it, expect } from 'vitest';
import { selectSystemNames, STAGE_A_DEFAULT_SYSTEMS, STAGE_B_ONLY_SYSTEMS } from '../lib/system-list.mjs';

describe('selectSystemNames', () => {
  it('excludes grep-agent and closed-book from Stage A defaults', () => {
    const { stageA } = selectSystemNames({ stage: 'a' });
    expect(stageA).not.toContain('grep-agent');
    expect(stageA).not.toContain('closed-book');
  });

  it('still excludes grep-agent and closed-book from Stage A defaults when stage is "ab"', () => {
    // This is the exact defect the fix targets: a combined run must not let
    // Stage B's system list leak into Stage A's.
    const { stageA } = selectSystemNames({ stage: 'ab' });
    expect(stageA).not.toContain('grep-agent');
    expect(stageA).not.toContain('closed-book');
    expect(stageA).toEqual(STAGE_A_DEFAULT_SYSTEMS);
  });

  it('includes grep-agent and closed-book in Stage B defaults when stage is "ab"', () => {
    const { stageB } = selectSystemNames({ stage: 'ab' });
    for (const name of STAGE_B_ONLY_SYSTEMS) expect(stageB).toContain(name);
    for (const name of STAGE_A_DEFAULT_SYSTEMS) expect(stageB).toContain(name);
  });

  it('Stage B defaults equal Stage A defaults when stage is "a" (no Stage B run requested)', () => {
    const { stageA, stageB } = selectSystemNames({ stage: 'a' });
    expect(stageB).toEqual(stageA);
  });

  it('honors an explicit --systems override verbatim for both stages, without filtering it', () => {
    const { stageA, stageB } = selectSystemNames({ stage: 'ab', requested: ['grep-agent'] });
    expect(stageA).toEqual(['grep-agent']);
    expect(stageB).toEqual(['grep-agent']);
  });

  it('honors an explicit --systems override on stage "a" too', () => {
    const { stageA, stageB } = selectSystemNames({ stage: 'a', requested: ['closed-book', 'cortex'] });
    expect(stageA).toEqual(['closed-book', 'cortex']);
    expect(stageB).toEqual(['closed-book', 'cortex']);
  });
});
