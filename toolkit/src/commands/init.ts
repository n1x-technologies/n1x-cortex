import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { ensureCortexIgnored } from '../gitignore.js';
import type { CortexConfig } from '../types.js';

export function runInit(vaultDir: string): { created: boolean; gitignoreUpdated: boolean; config: CortexConfig } {
  const keys = collectFrontmatterKeys(vaultDir);
  const config = loadConfig(vaultDir, keys);
  const gitignoreUpdated = ensureCortexIgnored(vaultDir);
  const file = join(vaultDir, '.cortex.json');
  if (existsSync(file)) return { created: false, gitignoreUpdated, config };
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return { created: true, gitignoreUpdated, config };
}
