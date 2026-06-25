import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import type { CortexConfig } from '../types.js';

export function runInit(vaultDir: string): { created: boolean; config: CortexConfig } {
  const keys = collectFrontmatterKeys(vaultDir);
  const config = loadConfig(vaultDir, keys);
  const file = join(vaultDir, '.cortex.json');
  if (existsSync(file)) return { created: false, config };
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return { created: true, config };
}
