import { describe, it, expect } from 'vitest';
import { computeFreshness } from '../src/viz/freshness.js';

const base = { exists: true, stale: false, status: 'documentado', draftStatus: 'borrador', verifiedStatus: 'verificado' };

describe('computeFreshness', () => {
  it('returns gap for a non-existing (dangling) node', () => {
    expect(computeFreshness({ ...base, exists: false })).toBe('gap');
  });
  it('returns stale when the source changed after the note (overrides status)', () => {
    expect(computeFreshness({ ...base, stale: true })).toBe('stale');
  });
  it('returns draft when status is the first lifecycle stage', () => {
    expect(computeFreshness({ ...base, status: 'borrador' })).toBe('draft');
  });
  it('returns verified when status is the last lifecycle stage', () => {
    expect(computeFreshness({ ...base, status: 'verificado' })).toBe('verified');
  });
  it('returns fresh otherwise', () => {
    expect(computeFreshness(base)).toBe('fresh');
  });
});
