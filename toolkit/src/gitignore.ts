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
 * So coverage is exactly one thing, decided over the whole file: does some
 * rule exclude the entire `.cortex` tree (`.cortex`, `.cortex/`, `.cortex/*`,
 * `.cortex/**`, optionally prefixed with a slash or a recursive-glob segment)?
 * If yes, there is nothing to add. If no, the block is appended even when the
 * file mentions `.cortex` in passing — a rule about `backups/` says nothing
 * about `models/`, and treating it as coverage is how the store ends up
 * committable.
 *
 * Negations are handled by changing WHAT is appended rather than whether. With
 * a `.cortex` negation present the appended rule is `.cortex/*`, which ignores
 * the tree's contents while leaving the negation functional; `.cortex/` would
 * exclude the directory itself and silently void it. That way the author's
 * intent survives and the cache is still ignored, instead of trading one for
 * the other.
 */
export function ensureCortexIgnored(vaultDir: string): boolean {
  const file = join(vaultDir, '.gitignore');

  if (!existsSync(file)) {
    writeFileSync(file, BLOCK);
    return true;
  }

  const current = readFileSync(file, 'utf8');

  // Decided over the FILE, not per line. Deciding per line meant one negation
  // anywhere granted blanket coverage: `.cortex/models/` plus
  // `!.cortex/models/m.json` was declared covered while `git check-ignore`
  // confirmed the embeddings store and backups were not ignored at all — the
  // previous revision's defect surviving in a narrower shape, switched back on
  // by adding a single `!` line.
  let hasWholeTree = false;
  let hasNegation = false;
  for (const line of current.split('\n')) {
    // Trailing whitespace and \r are stripped by git; LEADING whitespace is
    // not, so `  .cortex/` is a pattern with literal spaces that matches
    // nothing. Trimming both ends read it as coverage and left the store
    // committable.
    const t = line.replace(/\s+$/, '');
    if (!t || t.startsWith('#') || /^\s/.test(t)) continue;

    const negated = t.startsWith('!');
    const pattern = t.replace(/^!/, '').replace(/^\//, '').replace(/^\*\*\//, '');
    const targetsCortex = pattern === '.cortex' || pattern.startsWith('.cortex/');

    if (negated) {
      hasNegation ||= targetsCortex;
      continue;
    }
    // Does this rule exclude the whole tree? `.cortex`, `.cortex/`,
    // `.cortex/*` and `.cortex/**` all do; `.cortex/backups/` does not.
    const base = pattern.replace(/\/\*\*?$/, '').replace(/\/$/, '');
    hasWholeTree ||= base === '.cortex';
  }

  // A whole-tree exclusion already covers everything, negation or not.
  if (hasWholeTree) return false;

  // Nothing excludes the tree, so a rule has to be added. Where it goes
  // matters as much as what it says.
  //
  // With a `.cortex` negation present, two things change. The rule is the
  // CONTENTS form (`.cortex/*`), because `.cortex/` excludes the directory
  // itself and git cannot re-include a path inside an excluded directory — it
  // would silently void the negation, which is the original bug. And it is
  // INSERTED BEFORE the negation rather than appended, because git resolves by
  // last match: appended after the `!` line it wins anyway and the negation is
  // just as dead. A negation with no preceding base exclusion ignores nothing,
  // so putting the base where it belongs is what makes the author's intent
  // work rather than overriding it.
  if (hasNegation) {
    const lines = current.split('\n');
    const at = lines.findIndex(l => {
      const t = l.replace(/\s+$/, '');
      if (!t.startsWith('!')) return false;
      const p = t.slice(1).replace(/^\//, '').replace(/^\*\*\//, '');
      return p === '.cortex' || p.startsWith('.cortex/');
    });
    lines.splice(at, 0, '# Cortex (generated cache — do not commit)', '.cortex/*');
    writeFileSync(file, lines.join('\n'));
    return true;
  }

  const sep = current.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(file, current + sep + BLOCK);
  return true;
}
