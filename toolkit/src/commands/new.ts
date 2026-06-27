import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { recordCreations } from '../atomize/backup.js';
import { fillTemplate, resolveTypeDir } from '../new.js';

export interface NewOptions {
  title?: string;
  module?: string;
  dir?: string;
  /** Override the date placeholder (defaults to today). Mainly for tests. */
  date?: string;
}

export interface NewResult {
  created: boolean;
  path?: string;
  reason?: string;
}

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Scaffold a new note from `<templatesDir>/<type>.md`, in the folder where
 * notes of that type already live (or `--dir`), with `status: draft`. Reversible
 * via `cortex undo`. Refuses to overwrite an existing id or path.
 */
export function runNew(vaultDir: string, type: string, id: string, opts: NewOptions = {}): NewResult {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));

  const tplRel = `${config.templatesDir}/${type}.md`;
  const tplAbs = join(vaultDir, tplRel);
  if (!existsSync(tplAbs)) {
    return { created: false, reason: `no template at ${tplRel} — add one (placeholders: {{id}} {{title}} {{module}} {{date}} {{status}})` };
  }

  // Templates live under templatesDir and are scanned as notes — exclude them
  // so they don't count as collisions or skew the learned destination folder.
  const tplPrefix = `${config.templatesDir}/`;
  const notes = scanVault(vaultDir, config).filter(n => !n.path.startsWith(tplPrefix));
  if (notes.some(n => n.id === id)) {
    return { created: false, reason: `a note with id "${id}" already exists` };
  }

  const destDir = resolveTypeDir(notes, type, opts.dir);
  if (destDir == null) {
    return { created: false, reason: `couldn't infer a folder for type "${type}" — pass --dir <folder>` };
  }

  const rel = (destDir === '.' ? `${id}.md` : `${destDir}/${id}.md`);
  const abs = join(vaultDir, rel);
  if (existsSync(abs)) {
    return { created: false, reason: `${rel} already exists` };
  }

  const content = fillTemplate(readFileSync(tplAbs, 'utf8'), {
    id,
    title: opts.title ?? id,
    module: opts.module ?? '',
    date: opts.date ?? today(),
    status: 'draft',
  });

  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  recordCreations(vaultDir, [rel], makeRunId());
  return { created: true, path: rel };
}

export function formatNew(r: NewResult): string {
  return r.created
    ? `Created ${r.path} (status: draft). Undo with: cortex undo`
    : `Could not create note: ${r.reason}`;
}
