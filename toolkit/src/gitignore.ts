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
 */
export function ensureCortexIgnored(vaultDir: string): boolean {
  const file = join(vaultDir, '.gitignore');

  if (!existsSync(file)) {
    writeFileSync(file, BLOCK);
    return true;
  }

  const current = readFileSync(file, 'utf8');
  // Already covered if any line ignores the whole `.cortex/` directory.
  const covered = current.split('\n').some(line => {
    const t = line.trim();
    return t === '.cortex/' || t === '.cortex';
  });
  if (covered) return false;

  const sep = current.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(file, current + sep + BLOCK);
  return true;
}
