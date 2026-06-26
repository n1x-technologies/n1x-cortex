import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

const BACKUP_ROOT = '.cortex/backups';

export function backupNote(vaultDir: string, relPath: string, runId: string): string {
  const bakRel = `${BACKUP_ROOT}/${runId}/${relPath}`;
  const abs = join(vaultDir, bakRel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, readFileSync(join(vaultDir, relPath)));
  return bakRel;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function restoreLatestBackup(vaultDir: string): { restored: string[] } {
  const root = join(vaultDir, BACKUP_ROOT);
  if (!existsSync(root)) return { restored: [] };
  const runs = readdirSync(root).filter(r => statSync(join(root, r)).isDirectory()).sort();
  if (runs.length === 0) return { restored: [] };
  const latest = join(root, runs[runs.length - 1]); // lexicographically greatest runId
  const restored: string[] = [];
  for (const file of walk(latest)) {
    const rel = relative(latest, file).split(sep).join('/');
    writeFileSync(join(vaultDir, rel), readFileSync(file));
    restored.push(rel);
  }
  return { restored: restored.sort() };
}
