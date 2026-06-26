// toolkit/src/atomize/apply-distilled.ts
import { readFileSync } from 'node:fs';
import { slug } from './propose.js';
import { reconcile } from './reconcile.js';
import { scanVault } from '../vault.js';
import { applyAtomize } from './plan.js';
import type { AtomizePlan, AtomizePlanItem, DistilledInput, NoteSpec, CortexConfig } from '../types.js';

const INBOX = '_inbox';

export function applyDistilled(
  vaultDir: string,
  specsPath: string,
  config: CortexConfig,
  opts: { dryRun?: boolean } = {},
): { plan: AtomizePlan; written: string[] } {
  const dryRun = opts.dryRun ?? true;
  const input = JSON.parse(readFileSync(specsPath, 'utf8')) as DistilledInput;
  const existing = scanVault(vaultDir, config);
  const status = config.statusLifecycle[0] ?? 'draft';

  const usedPaths = new Set<string>();
  const items: AtomizePlanItem[] = input.notes.map(n => {
    const safeFolder = (n.folder && !n.folder.startsWith('/') && !n.folder.split('/').includes('..'))
      ? n.folder
      : null;
    const spec: NoteSpec = {
      id: slug(n.title),
      title: n.title,
      type: n.type ?? null,
      body: n.body,
      source: input.source,
      status,
      folder: safeFolder,
      tags: n.tags,
    };
    const folderPrefix = safeFolder ? `${safeFolder}/` : '';
    const { action, matchPath } = reconcile(spec, existing);
    if (action !== 'create') {
      return { spec, action, matchPath, destPath: `${INBOX}/${folderPrefix}${spec.id}.md` };
    }
    // De-collide within the batch: empty slug → 'note'; duplicate path → -2, -3, …
    const baseId = spec.id.trim() === '' ? 'note' : spec.id;
    let finalId = baseId;
    let candidatePath = `${INBOX}/${folderPrefix}${finalId}.md`;
    let counter = 2;
    while (usedPaths.has(candidatePath)) {
      finalId = `${baseId}-${counter}`;
      candidatePath = `${INBOX}/${folderPrefix}${finalId}.md`;
      counter++;
    }
    usedPaths.add(candidatePath);
    return { spec: { ...spec, id: finalId }, action, matchPath, destPath: candidatePath };
  });

  const plan: AtomizePlan = { source: input.source, items, dryRun };
  const { written } = applyAtomize(vaultDir, plan); // reuses dry-run guard, _inbox confinement, render, mkdir
  return { plan, written };
}
