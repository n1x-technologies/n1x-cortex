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
 * Two failure modes to avoid, pulling in opposite directions.
 *
 * Appending too eagerly: matching only a literal `.cortex/` meant a
 * deliberately scoped ignore —
 *
 *     .cortex/*
 *     !.cortex/embeddings/
 *
 * — did not count as covered, so a blanket `.cortex/` got appended underneath.
 * git cannot re-include a path inside an excluded directory, so that one line
 * silently voided the negation, and the damage stays invisible until the store
 * gains a second file.
 *
 * Appending too rarely: treating ANY mention of `.cortex` as intent means a
 * vault with only `.cortex/backups/` is declared covered, and the several-MB
 * model and embedding store are left committable with no warning — the callers
 * print nothing when this returns false, so silence is indistinguishable from
 * "already ignored".
 *
 * So coverage is two specific things, not any mention:
 *
 *   - a rule that excludes the whole tree (`.cortex`, `.cortex/`, `.cortex/*`,
 *     optionally prefixed with a slash or a recursive-glob segment), or
 *   - a NEGATION naming `.cortex`, which is the only shape appending can
 *     damage. Leave those alone even when nothing else excludes the tree: a
 *     negation with no base exclusion ignores nothing, but the author plainly
 *     meant something, and quietly overriding it is the original bug.
 *
 * A partial rule like `.cortex/backups/` is neither, so the block is appended
 * — safe there, because with no negation present nothing can be voided.
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

    const negated = t.startsWith('!');
    const pattern = t.replace(/^!/, '').replace(/^\*\*\//, '').replace(/^\//, '');

    // A negation about .cortex is the only shape appending can damage.
    if (negated) return pattern === '.cortex' || pattern.startsWith('.cortex/');

    // Otherwise: does this rule exclude the whole tree?
    const base = pattern.replace(/\/\*$/, '').replace(/\/$/, '');
    return base === '.cortex';
  });
  if (covered) return false;

  const sep = current.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(file, current + sep + BLOCK);
  return true;
}
