import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { segmentSource } from './segment.js';
import { proposeNotes } from './propose.js';
import { reconcile } from './reconcile.js';
import { renderNote } from './render.js';
import type { AtomizePlan, AtomizePlanItem, CortexConfig } from '../types.js';

export { renderNote };

// Where new draft notes land: a `_inbox/` folder under the vault root (review then move).
const INBOX = '_inbox';

export function planAtomize(vaultDir: string, sourcePath: string, config: CortexConfig, opts: { dryRun?: boolean } = {}): AtomizePlan {
  const dryRun = opts.dryRun ?? true;
  const sourceName = basename(sourcePath).replace(/\.md$/i, '');
  const text = readFileSync(sourcePath, 'utf8');
  const segments = segmentSource(text);
  const specs = proposeNotes(segments, sourceName, config);
  const existing = scanVault(vaultDir, config);

  const items: AtomizePlanItem[] = specs.map(spec => {
    const { action, matchPath } = reconcile(spec, existing);
    const destPath = `${INBOX}/${spec.id}.md`;
    return { spec, action, matchPath, destPath };
  });
  return { source: sourceName, items, dryRun };
}

export function applyAtomize(vaultDir: string, plan: AtomizePlan): { written: string[] } {
  if (plan.dryRun) return { written: [] };
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const written: string[] = [];
  for (const item of plan.items) {
    if (item.action !== 'create') continue;
    const abs = join(vaultDir, item.destPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, renderNote(item.spec, config));
    written.push(item.destPath);
  }
  return { written };
}
