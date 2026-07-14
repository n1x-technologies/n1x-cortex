// toolkit/src/atomize/apply-distilled.ts
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
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

/**
 * Normalize a model-provided folder. We always prepend `_inbox/` ourselves, so a
 * folder that already starts with `_inbox/` (weaker/local models echo it — seen
 * live during a real ollama bootstrap) must have those leading segments stripped,
 * else notes land at `_inbox/_inbox/…`. Rejects absolute paths and `..` traversal.
 * Returns null when nothing usable remains (→ note goes to `_inbox/` root).
 */
function sanitizeFolder(folder: string | null | undefined): string | null {
  if (!folder || folder.startsWith('/') || folder.split('/').includes('..')) return null;
  let f = folder.replace(/^\/+|\/+$/g, '');
  while (f === INBOX || f.startsWith(INBOX + '/')) f = f.slice(INBOX.length).replace(/^\/+/, '');
  return f === '' ? null : f;
}

/**
 * Coerce a model-provided `tags` value into a clean string[]. Models sometimes
 * return a comma string ("a, b") instead of an array (a real ollama run crashed
 * on `spec.tags.join`); normalize both shapes here at the untrusted boundary.
 */
function normalizeTags(tags: unknown): string[] | undefined {
  const arr = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : [];
  const clean = arr.filter((t): t is string => typeof t === 'string').map(t => t.trim()).filter(Boolean);
  return clean.length ? clean : undefined;
}

/** File-path entry point: read distilled specs from disk, then apply them. */
export function applyDistilled(
  vaultDir: string,
  specsPath: string,
  config: CortexConfig,
  opts: { dryRun?: boolean; force?: boolean; runId?: string } = {},
): DistilledApplyResult {
  const input = JSON.parse(readFileSync(specsPath, 'utf8')) as DistilledInput;
  return applyDistilledInput(vaultDir, input, config, opts);
}

/**
 * Inline entry point: apply already-parsed distilled specs (no disk round-trip).
 * This is the seam the MCP `cortex_atomize_apply` tool uses — the calling agent
 * passes its distilled notes inline; the write/backup/undo path is identical to
 * the file-based CLI flow.
 */
export function applyDistilledInput(
  vaultDir: string,
  input: DistilledInput,
  config: CortexConfig,
  opts: { dryRun?: boolean; force?: boolean; runId?: string } = {},
): DistilledApplyResult {
  const dryRun = opts.dryRun ?? true;
  const force = opts.force ?? false;
  const runId = opts.runId ?? makeRunId();
  const existing = scanVault(vaultDir, config);
  const status = config.statusLifecycle[0] ?? 'draft';
  const sourcesDir = config.sourcesDir.replace(/\/$/, '');
  const vaultAbs = resolve(vaultDir);

  // ── create items: unchanged 3.1 behavior ──────────────────────────
  const usedPaths = new Set<string>();
  const createItems: AtomizePlanItem[] = input.notes
    .filter(n => (n.action ?? 'create') === 'create')
    .map(n => {
      const safeFolder = sanitizeFolder(n.folder);
      const spec: NoteSpec = {
        id: slug(n.title), title: n.title, type: n.type ?? null, body: n.body,
        source: input.source, status, folder: safeFolder, tags: normalizeTags(n.tags),
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
      spec: { id: '', title: n.title, type: n.type ?? null, body: n.body, source: input.source, status, folder: null, tags: normalizeTags(n.tags) },
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
