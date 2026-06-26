import { cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');  // toolkit/
const repoRoot = join(pkgDir, '..');                                   // repo root

// Copy root README and LICENSE into the package directory so npm pack
// includes them in the tarball (npm auto-includes root-level README/LICENSE).
await cp(join(repoRoot, 'README.md'), join(pkgDir, 'README.md'));
await cp(join(repoRoot, 'LICENSE'),   join(pkgDir, 'LICENSE'));

console.log('copied README.md + LICENSE from repo root into package directory');
