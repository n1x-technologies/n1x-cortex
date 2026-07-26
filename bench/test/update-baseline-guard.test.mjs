// FIX 2 (Important): `--update-baseline` used to write whatever was in the
// current results.perSystem, unconditionally. A --systems-scoped run (e.g.
// `--systems cortex`) would then overwrite the committed baseline with an
// entry for only that one system, permanently narrowing gate coverage with
// no warning — every later `--gate 1` run would pass while checking only
// one of five systems. This is an integration test, not a unit test on
// gate.mjs, because the guard lives in run.mjs's CLI argument handling: it
// must refuse to write BEFORE the baseline file is touched.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const runMjs = resolve(here, '../run.mjs');
const baselinePath = resolve(here, '../fixtures/baseline.json');

describe('--update-baseline guard', () => {
  it('refuses to write when --systems narrows the run, and leaves the baseline untouched', () => {
    const before = readFileSync(baselinePath, 'utf8');

    let error;
    try {
      execFileSync(
        'node',
        [runMjs, '--stage', 'a', '--corpus', 'fixtures', '--systems', 'cortex', '--update-baseline', '1'],
        { cwd: resolve(here, '..'), stdio: 'pipe' },
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.status).not.toBe(0);
    expect(error.stderr.toString()).toMatch(/--update-baseline refuses to run with --systems/);

    // The baseline must not have been narrowed to just 'cortex'.
    const after = readFileSync(baselinePath, 'utf8');
    expect(after).toBe(before);
    expect(Object.keys(JSON.parse(after).perSystem).length).toBeGreaterThan(1);
  }, 30000);
});
