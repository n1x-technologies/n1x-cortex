// toolkit/src/curate/merge.ts
//
// Phase 7 support — close the `dupes` loop: merge a near-duplicate pair into one
// note. The AI layer (the /dupes-merge skill) reads both notes and produces the
// merged file content; this module does the deterministic, *reversible* mechanics:
// back up both notes, overwrite the keeper, redirect every wikilink that pointed
// at the dropped note, delete the dropped note. Every edit is backed up under one
// runId, so `cortex undo` restores the whole merge (keeper, dropped, and links).
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { scanVault } from '../vault.js';
import { backupNote } from '../atomize/backup.js';
import type { CortexConfig, Note } from '../types.js';

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function basename(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

/** Same alias→id resolution precedence as buildGraph (id > title/basename, later wins). */
function buildResolve(notes: Note[]): Map<string, string> {
  const resolve = new Map<string, string>();
  for (const n of notes) for (const alias of [n.title, basename(n.path)]) if (alias) resolve.set(alias, n.id);
  for (const n of notes) if (n.id) resolve.set(n.id, n.id);
  return resolve;
}

const LINK_RE = /\[\[([^\]]+)\]\]/g;

/** Rewrite the inside of a `[[...]]` to point at keepAlias, preserving any #section and |alias. */
export function redirectInner(inner: string, keepAlias: string): string {
  const pipeIdx = inner.search(/\\?\|/);                       // bare or table-escaped pipe
  const beforePipe = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
  const aliasPart = pipeIdx >= 0 ? inner.slice(pipeIdx) : '';  // includes the (escaped) pipe + display text
  const hashIdx = beforePipe.indexOf('#');
  const sectionPart = hashIdx >= 0 ? beforePipe.slice(hashIdx) : '';
  return `${keepAlias}${sectionPart}${aliasPart}`;
}

/** Redirect every link in `raw` that resolves to dropId so it points at keepAlias. */
export function redirectLinks(raw: string, dropId: string, keepAlias: string, resolve: Map<string, string>): string {
  return raw.replace(LINK_RE, (full, inner: string) => {
    const target = inner.split(/\\?\|/)[0].split('#')[0].trim();
    return resolve.get(target) === dropId ? `[[${redirectInner(inner, keepAlias)}]]` : full;
  });
}

export interface MergeSpec { keepPath: string; dropPath: string; content: string; }
export interface MergeResult {
  keep: string;
  dropped: string;
  redirected: string[];
  backups: string[];
  runId: string | null;
  dryRun: boolean;
  skipped?: { reason: string };
}

export function runMergeNotes(
  vaultDir: string,
  config: CortexConfig,
  spec: MergeSpec,
  opts: { write?: boolean } = {},
): MergeResult {
  const dryRun = !opts.write;
  const base: MergeResult = { keep: spec.keepPath, dropped: spec.dropPath, redirected: [], backups: [], runId: null, dryRun };

  if (spec.keepPath === spec.dropPath) return { ...base, skipped: { reason: 'same-note' } };
  if (!existsSync(join(vaultDir, spec.keepPath))) return { ...base, skipped: { reason: 'keep-missing' } };
  if (!existsSync(join(vaultDir, spec.dropPath))) return { ...base, skipped: { reason: 'drop-missing' } };

  const notes = scanVault(vaultDir, config);
  const drop = notes.find(n => n.path === spec.dropPath);
  const keep = notes.find(n => n.path === spec.keepPath);
  if (!drop || !keep) return { ...base, skipped: { reason: 'not-in-vault' } };

  const resolve = buildResolve(notes);
  const keepAlias = keep.id;

  // Which other notes link to the dropped note → need their links redirected.
  const edits: { path: string; body: string }[] = [];
  for (const n of notes) {
    if (n.path === spec.dropPath || n.path === spec.keepPath) continue;
    if (!n.links.some(l => resolve.get(l.target) === drop.id)) continue;
    const raw = readFileSync(join(vaultDir, n.path), 'utf8');
    const rewritten = redirectLinks(raw, drop.id, keepAlias, resolve);
    if (rewritten !== raw) edits.push({ path: n.path, body: rewritten });
  }

  if (dryRun) return { ...base, redirected: edits.map(e => e.path).sort() };

  const runId = makeRunId();
  const backups: string[] = [];
  backups.push(backupNote(vaultDir, spec.keepPath, runId));
  backups.push(backupNote(vaultDir, spec.dropPath, runId));
  writeFileSync(join(vaultDir, spec.keepPath), spec.content);
  for (const e of edits) {
    backups.push(backupNote(vaultDir, e.path, runId));
    writeFileSync(join(vaultDir, e.path), e.body);
  }
  rmSync(join(vaultDir, spec.dropPath));

  return { keep: spec.keepPath, dropped: spec.dropPath, redirected: edits.map(e => e.path).sort(), backups, runId, dryRun: false };
}
