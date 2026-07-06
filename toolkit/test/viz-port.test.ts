// toolkit/test/viz-port.test.ts
//
// The `viz --port` flag was silently ignored (the CLI always bound 4317 and
// the config `viz.port` was never read). resolveVizPort is the pure seam the
// CLI now uses: flag > config > 4317, with validation.
import { describe, it, expect } from 'vitest';
import { resolveVizPort } from '../src/commands/viz.js';

describe('resolveVizPort', () => {
  it('uses --port when given', () => {
    expect(resolveVizPort(['--port', '8080'], 4317)).toBe(8080);
  });

  it('falls back to the config port when no flag', () => {
    expect(resolveVizPort([], 5000)).toBe(5000);
  });

  it('falls back to 4317 when neither flag nor config', () => {
    expect(resolveVizPort([], undefined)).toBe(4317);
  });

  it('prefers the flag over the config port', () => {
    expect(resolveVizPort(['--port', '9000'], 5000)).toBe(9000);
  });

  it('rejects a non-numeric or out-of-range --port', () => {
    expect(resolveVizPort(['--port', 'abc'], 4317)).toBe('invalid');
    expect(resolveVizPort(['--port', '0'], 4317)).toBe('invalid');
    expect(resolveVizPort(['--port', '70000'], 4317)).toBe('invalid');
    expect(resolveVizPort(['--port'], 4317)).toBe('invalid');
  });
});
