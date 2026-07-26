import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BLOCK = '# Cortex (generated cache — do not commit)\n.cortex/\n';

/**
 * Ensure the vault's `.gitignore` ignores the generated `.cortex/` cache
 * (embeddings, backups, promotions, models, out) — a heavy, per-machine
 * artifact that must never be committed. `.cortex.json` (a file at the root,
 * not under `.cortex/`) is intentionally left committable.
 *
 * Idempotent: returns true only when the file was actually changed.
 *
 * "Already covered" deliberately means ANY rule mentioning `.cortex`, not just
 * a literal `.cortex/`. Matching only the exact line meant a deliberately
 * scoped ignore —
 *
 *     .cortex/*
 *     !.cortex/embeddings/
 *
 * — did not count as covered, so this function appended a blanket `.cortex/`
 * underneath it. git cannot re-include a path inside an excluded directory, so
 * that one appended line silently voided the negation: files already tracked
 * stayed tracked and everything new under the store became invisible. The
 * damage is invisible until the store gains a second file, at which point it
 * is data loss with no error anywhere.
 *
 * A user who has written any `.cortex` rule has expressed intent about that
 * directory. Overriding it is what caused the bug, so presence of intent is
 * the signal, and this function leaves the file alone.
 */
export function ensureCortexIgnored(vaultDir: string): boolean {
  const file = join(vaultDir, '.gitignore');

  if (!existsSync(file)) {
    writeFileSync(file, BLOCK);
    return true;
  }

  const current = readFileSync(file, 'utf8');
  const covered = current.split('\n').some(line => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return false;
    // Strip a negation prefix and a leading slash, then ask whether the
    // pattern is about `.cortex` at all.
    const pattern = t.replace(/^!/, '').replace(/^\//, '');
    return pattern === '.cortex' || pattern.startsWith('.cortex/');
  });
  if (covered) return false;

  const sep = current.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(file, current + sep + BLOCK);
  return true;
}
