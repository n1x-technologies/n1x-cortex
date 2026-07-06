// toolkit/src/atomize/set-status.ts
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { backupNote } from './backup.js';
import type { CortexConfig } from '../types.js';

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function patchStatus(content: string, field: string, value: string): string {
  const m = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!m) return `---\n${field}: "${value}"\n---\n\n${content}`;
  const line = new RegExp(`^${field}:.*$`, 'm');
  const newBody = line.test(m[2]) ? m[2].replace(line, `${field}: "${value}"`) : `${m[2]}\n${field}: "${value}"`;
  return content.replace(m[0], `${m[1]}${newBody}${m[3]}`);
}

export function setStatus(
  vaultDir: string,
  notePath: string,
  newStatus: string,
  config: CortexConfig,
  opts: { dryRun?: boolean; runId?: string } = {},
): { changed: string | null; backup: string | null; skipped?: { target: string; reason: string } } {
  const dryRun = opts.dryRun ?? true;
  const runId = opts.runId ?? makeRunId();
  const abs = resolve(vaultDir, notePath);
  const vaultAbs = resolve(vaultDir);
  if (abs !== vaultAbs && !abs.startsWith(vaultAbs + sep)) return { changed: null, backup: null, skipped: { target: notePath, reason: 'outside-vault' } };
  if (!existsSync(abs)) return { changed: null, backup: null, skipped: { target: notePath, reason: 'not-found' } };
  const realTarget = realpathSync(abs);
  const sourcesAbs = resolve(vaultDir, config.sourcesDir.replace(/\/$/, ''));
  const realSources = existsSync(sourcesAbs) ? realpathSync(sourcesAbs) : sourcesAbs;
  if (realTarget === realSources || realTarget.startsWith(realSources + sep)) return { changed: null, backup: null, skipped: { target: notePath, reason: 'source-immutable' } };

  const patched = patchStatus(readFileSync(abs, 'utf8'), config.fields.status, newStatus);
  if (dryRun) return { changed: null, backup: null };
  const backup = backupNote(vaultDir, notePath, runId);
  writeFileSync(abs, patched);
  return { changed: notePath, backup };
}
