// toolkit/src/atomize/apply-distilled.ts
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { slug } from './propose.js';
import { reconcile } from './reconcile.js';
import { scanVault } from '../vault.js';
import { applyAtomize } from './plan.js';
import { renderUpdatedNote } from './render.js';
import { backupNote } from './backup.js';
import { parseFrontmatter } from '../frontmatter.js';
import type { AtomizePlan, AtomizePlanItem, DistilledInput, DistilledApplyResult, NoteSpec, CortexConfig } from '../types.js';

const INBOX = '_inbox';

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function applyDistilled(
  vaultDir: string,
  specsPath: string,
  config: CortexConfig,
  opts: { dryRun?: boolean; force?: boolean; runId?: string } = {},
): DistilledApplyResult {
  const dryRun = opts.dryRun ?? true;
  const force = opts.force ?? false;
  const runId = opts.runId ?? makeRunId();
  const input = JSON.parse(readFileSync(specsPath, 'utf8')) as DistilledInput;
  const existing = scanVault(vaultDir, config);
  const status = config.statusLifecycle[0] ?? 'draft';
  const sourcesDir = config.sourcesDir.replace(/\/$/, '');
  const vaultAbs = resolve(vaultDir);

  // ── create items: unchanged 3.1 behavior ──────────────────────────
  const usedPaths = new Set<string>();
  const createItems: AtomizePlanItem[] = input.notes
    .filter(n => (n.action ?? 'create') === 'create')
    .map(n => {
      const safeFolder = (n.folder && !n.folder.startsWith('/') && !n.folder.split('/').includes('..')) ? n.folder : null;
      const spec: NoteSpec = {
        id: slug(n.title), title: n.title, type: n.type ?? null, body: n.body,
        source: input.source, status, folder: safeFolder, tags: n.tags,
      };
      const folderPrefix = safeFolder ? `${safeFolder}/` : '';
      const { action, matchPath } = reconcile(spec, existing);
      if (action !== 'create') return { spec, action, matchPath, destPath: `${INBOX}/${folderPrefix}${spec.id}.md` };
      const baseId = spec.id.trim() === '' ? 'note' : spec.id;
      let finalId = baseId;
      let candidatePath = `${INBOX}/${folderPrefix}${finalId}.md`;
      let counter = 2;
      while (usedPaths.has(candidatePath)) { finalId = `${baseId}-${counter}`; candidatePath = `${INBOX}/${folderPrefix}${finalId}.md`; counter++; }
      usedPaths.add(candidatePath);
      return { spec: { ...spec, id: finalId }, action, matchPath, destPath: candidatePath };
    });

  // ── update items: validate → shrink-guard → backup → in-place write ──
  const updated: string[] = [];
  const backups: string[] = [];
  const skipped: { target: string; reason: string }[] = [];
  const updateItems: AtomizePlanItem[] = [];

  for (const n of input.notes.filter(n => n.action === 'update')) {
    const target = n.targetPath ?? '';
    const abs = resolve(vaultDir, target);
    const inVault = abs === vaultAbs || abs.startsWith(vaultAbs + sep);
    if (!target || !inVault) { skipped.push({ target, reason: 'outside-vault' }); continue; }
    if (!existsSync(abs)) { skipped.push({ target, reason: 'not-found' }); continue; }
    // canonicalize to close absolute-path / case-insensitive / symlink bypasses of the source guard
    const realTarget = realpathSync(abs);
    const sourcesAbs = resolve(vaultDir, sourcesDir);
    const realSources = existsSync(sourcesAbs) ? realpathSync(sourcesAbs) : sourcesAbs;
    if (realTarget === realSources || realTarget.startsWith(realSources + sep)) {
      skipped.push({ target, reason: 'source-immutable' }); continue;
    }

    const existingContent = readFileSync(abs, 'utf8');
    const existingBody = parseFrontmatter(existingContent).body.trim();
    if (!force && n.body.trim().length < existingBody.length * 0.5) { skipped.push({ target, reason: 'shrink-guard' }); continue; }

    updateItems.push({
      spec: { id: '', title: n.title, type: n.type ?? null, body: n.body, source: input.source, status, folder: null, tags: n.tags },
      action: 'update', matchPath: target, destPath: target,
    });
    if (!dryRun) {
      backups.push(backupNote(vaultDir, target, runId));
      writeFileSync(abs, renderUpdatedNote(existingContent, n.body, input.source));
      updated.push(target);
    }
  }

  const plan: AtomizePlan = { source: input.source, items: [...createItems, ...updateItems], dryRun };
  const { written } = applyAtomize(vaultDir, plan); // writes only create items; ignores update items
  return { plan, written, updated, backups, skipped };
}
