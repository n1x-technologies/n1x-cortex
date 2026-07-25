// Shared vault walker. Every Cortex system scans the vault through the
// toolkit's scanVault, which honours config.templatesDir and so never sees
// the `_templates/note.md` scaffold. Any bench system that walks the
// filesystem directly (full-context, naive-rag, ...) must skip the same
// directory, or it ends up scanning a different corpus than the retrievers
// it's being compared against — a fairness bug, not a style nit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function readTemplatesDir(vaultDir) {
  try {
    const config = JSON.parse(readFileSync(join(vaultDir, '.cortex.json'), 'utf8'));
    return config.templatesDir ?? '_templates';
  } catch {
    return '_templates';
  }
}

function walk(dir, excludeAbs, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (p === excludeAbs) continue;
    if (statSync(p).isDirectory()) walk(p, excludeAbs, acc);
    else if (entry.endsWith('.md')) acc.push(p);
  }
  return acc;
}

/** Every markdown note's absolute path, excluding the vault's templates directory. */
export function walkVault(vaultDir) {
  const excludeAbs = join(vaultDir, readTemplatesDir(vaultDir));
  return walk(vaultDir, excludeAbs);
}
