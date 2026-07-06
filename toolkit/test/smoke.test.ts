import { describe, it, expect } from 'vitest';
import { DEFAULT_LIFECYCLE } from '../src/types.js';

describe('scaffold', () => {
  it('exposes the default status lifecycle', () => {
    expect(DEFAULT_LIFECYCLE).toEqual(['draft', 'documented', 'verified']);
  });
});
