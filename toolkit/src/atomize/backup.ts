import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
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
    const dest = join(vaultDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(file));
    restored.push(rel);
  }
  return { restored: restored.sort() };
}

const PROMOTIONS_ROOT = '.cortex/promotions';

export function recordPromotions(vaultDir: string, moves: { from: string; to: string }[], runId: string): string {
  const rel = `${PROMOTIONS_ROOT}/${runId}.json`;
  const abs = join(vaultDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify({ moves }, null, 2));
  return rel;
}

/** Record freshly created files so `cortex undo` can delete them. */
export function recordCreations(vaultDir: string, created: string[], runId: string): string {
  const rel = `${PROMOTIONS_ROOT}/${runId}.json`;
  const abs = join(vaultDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify({ moves: [], created }, null, 2));
  return rel;
}

export function undoLatestRun(vaultDir: string): { restored: string[]; reverted: string[] } {
  const backupsRoot = join(vaultDir, '.cortex/backups');
  const promosRoot = join(vaultDir, PROMOTIONS_ROOT);
  const backupRuns = existsSync(backupsRoot)
    ? readdirSync(backupsRoot).filter(r => statSync(join(backupsRoot, r)).isDirectory()).map(id => ({ id, kind: 'backup' as const }))
    : [];
  const promoRuns = existsSync(promosRoot)
    ? readdirSync(promosRoot).filter(f => f.endsWith('.json')).map(f => ({ id: f.replace(/\.json$/, ''), kind: 'promo' as const }))
    : [];
  const all = [...backupRuns, ...promoRuns].sort((a, b) => a.id.localeCompare(b.id));
  if (all.length === 0) return { restored: [], reverted: [] };
  const latest = all[all.length - 1];
  if (latest.kind === 'backup') {
    const { restored } = restoreLatestBackup(vaultDir);
    rmSync(join(vaultDir, '.cortex/backups', latest.id), { recursive: true, force: true });
    return { restored, reverted: [] };
  }

  const journalPath = join(promosRoot, `${latest.id}.json`);
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    moves: { from: string; to: string }[];
    created?: string[];
  };
  const reverted: string[] = [];
  for (const m of journal.moves) {
    const toAbs = join(vaultDir, m.to);
    if (!existsSync(toAbs)) continue;
    const fromAbs = join(vaultDir, m.from);
    mkdirSync(dirname(fromAbs), { recursive: true });
    writeFileSync(fromAbs, readFileSync(toAbs));
    rmSync(toAbs);
    reverted.push(m.from);
  }
  // Undo creations by deleting the files that were scaffolded.
  for (const rel of journal.created ?? []) {
    const abs = join(vaultDir, rel);
    if (existsSync(abs)) { rmSync(abs); reverted.push(rel); }
  }
  rmSync(journalPath); // consume the journal so the next undo targets the prior run
  return { restored: [], reverted: reverted.sort() };
}
