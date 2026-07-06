// toolkit/src/atomize/bootstrap/discover.ts
//
// Repo walk for `cortex bootstrap`. Respects .gitignore by asking git itself
// (`git ls-files`) — no ignore-matching library, no new dependency. Falls back
// to a plain recursive walk for non-git directories. Classifies each file as a
// code or doc source and skips what can't be distilled (binaries, lockfiles,
// vendored, oversized, and Cortex's own output folders).

import { execFileSync } from 'node:child_process';
import { openSync, readSync, closeSync, statSync, readdirSync } from 'node:fs';
import { join, relative, extname, basename, sep } from 'node:path';
import type { CortexConfig } from '../../types.js';

export interface ManifestEntry { path: string; kind: 'doc' | 'code'; bytes: number }
export interface DiscoverResult { files: ManifestEntry[]; skipped: { path: string; reason: string }[] }

const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.rb', '.php',
  '.java', '.kt', '.scala', '.swift', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs',
  '.sh', '.bash', '.sql', '.vue', '.svelte', '.lua', '.r', '.dart',
]);
const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.cortex', '_inbox', 'dist', 'build', 'vendor', 'coverage', '.next', '.venv']);
const LOCK_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 'poetry.lock', 'composer.lock', 'gemfile.lock']);
const MAX_BYTES = 256_000;

/** List candidate files relative to root: git-tracked + untracked-not-ignored, or a plain walk. */
function listFiles(root: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\n').filter(Boolean);
  } catch {
    // Not a git repo (or git unavailable) → walk, applying SKIP_DIRS.
    const acc: string[] = [];
    const walk = (abs: string) => {
      for (const name of readdirSync(abs)) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(abs, name);
        if (statSync(full).isDirectory()) walk(full);
        else acc.push(relative(root, full).split(sep).join('/'));
      }
    };
    walk(root);
    return acc;
  }
}

/** First 4 KB contains a NUL byte → treat as binary. */
function looksBinary(abs: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(abs, 'r');
    const buf = Buffer.alloc(4096);
    const n = readSync(fd, buf, 0, 4096, 0);
    return buf.subarray(0, n).includes(0);
  } catch {
    return true;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function discover(root: string, config: CortexConfig): DiscoverResult {
  const files: ManifestEntry[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const sourcesDir = config.sourcesDir.replace(/\/$/, '');

  for (const rel of listFiles(root)) {
    const segs = rel.split('/');
    if (segs.some(s => SKIP_DIRS.has(s)) || segs[0] === sourcesDir) { continue; } // Cortex/vendored dirs: silent skip
    const ext = extname(rel).toLowerCase();
    const name = basename(rel).toLowerCase();
    const abs = join(root, rel);
    if (LOCK_FILES.has(name) || name.endsWith('.min.js') || name.endsWith('.min.css')) { skipped.push({ path: rel, reason: 'lockfile/minified' }); continue; }
    let bytes = 0;
    try { bytes = statSync(abs).size; } catch { skipped.push({ path: rel, reason: 'unreadable' }); continue; }
    if (bytes > MAX_BYTES) { skipped.push({ path: rel, reason: `too large (${bytes} bytes)` }); continue; }
    // Binary sniff runs before extension classification: a binary file should be
    // reported as such (e.g. logo.png) rather than masked by "unsupported extension".
    if (looksBinary(abs)) { skipped.push({ path: rel, reason: 'binary' }); continue; }
    const kind = CODE_EXT.has(ext) ? 'code' : DOC_EXT.has(ext) ? 'doc' : null;
    if (!kind) { skipped.push({ path: rel, reason: `unsupported extension (${ext || 'none'})` }); continue; }
    files.push({ path: rel, kind, bytes });
  }
  return { files, skipped };
}
