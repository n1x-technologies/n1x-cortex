// `main(argv).then(code => process.exit(code))` truncates output.
//
// process.exit() does not wait for pending writes. When stdout is a TTY those
// writes are synchronous on POSIX and nothing is lost, which is why this never
// showed up in a terminal. When stdout is a PIPE they are asynchronous, so
// anything still buffered when exit() runs is discarded. A consumer reading
// `cortex query --json` through a pipe got JSON cut off mid-document, their
// parse failed, and their app reported "I couldn't find this in the source" —
// with retrieval having worked perfectly.
//
// It stayed hidden because the hit count was hard-capped at 12, keeping output
// under the pipe buffer. Adding --limit removes that accidental protection, so
// this fix is a prerequisite for that flag rather than a separate nicety.
//
// These tests cover the drain contract directly. Reproducing the truncation
// end-to-end would mean asserting that a bug still exists in an unfixed
// binary — platform- and version-dependent, and worthless once fixed.
import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { flushStream, exitAfterFlush } from '../src/cli.js';

/**
 * A stream that holds every write until released, so "still buffered" is
 * observable. Releasing frees the queue AND stops blocking, because the flush
 * being tested appends its own zero-length write to that queue — a helper that
 * freed one callback per call would leave that write pending forever and the
 * test would time out on the helper rather than on the behaviour.
 */
function blockedStream(): Writable & { release(): void; written(): string } {
  const chunks: string[] = [];
  const pending: Array<() => void> = [];
  let blocked = true;
  const s = new Writable({
    highWaterMark: 1,
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      if (blocked) pending.push(() => cb());
      else cb();
    },
  }) as Writable & { release(): void; written(): string };
  s.release = () => {
    blocked = false;
    while (pending.length) pending.shift()!();
  };
  s.written = () => chunks.join('');
  return s;
}

describe('flushStream', () => {
  it('resolves immediately when nothing is buffered', async () => {
    const s = new Writable({ write(_c, _e, cb) { cb(); } });
    await expect(flushStream(s)).resolves.toBeUndefined();
  });

  it('does NOT resolve while a write is still pending', async () => {
    const s = blockedStream();
    s.write('x'.repeat(64));
    s.write('y'.repeat(64));           // queued behind the blocked first write

    let settled = false;
    const p = flushStream(s).then(() => { settled = true; });

    // Give the microtask queue every chance to settle it early.
    await new Promise(r => setImmediate(r));
    expect(settled).toBe(false);

    s.release();
    s.release();
    await p;
    expect(settled).toBe(true);
  });

  it('resolves on a stream that errored rather than hanging forever', async () => {
    // A broken pipe (reader closed first) must not wedge the process on exit.
    // Losing output to a reader that went away is fine; never exiting is not.
    const s = new Writable({ write(_c, _e, cb) { cb(new Error('EPIPE')); } });
    s.on('error', () => {});
    s.write('x');
    await expect(flushStream(s)).resolves.toBeUndefined();
  });
});

describe('exitAfterFlush', () => {
  it('flushes every stream before exiting, and exits with the given code', async () => {
    const out = blockedStream();
    const err = blockedStream();
    out.write('payload');
    err.write('diagnostic');

    let exited: number | undefined;
    const p = exitAfterFlush(3, { exit: c => { exited = c; }, streams: [out, err] });

    await new Promise(r => setImmediate(r));
    expect(exited).toBeUndefined();   // must not have exited with writes pending

    out.release();
    err.release();
    await p;

    expect(exited).toBe(3);
    expect(out.written()).toBe('payload');
    expect(err.written()).toBe('diagnostic');
  });
});
