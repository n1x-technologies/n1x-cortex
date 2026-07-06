import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { segmentSource } from './segment.js';
import { scanVault } from '../vault.js';
import { DISTILL_METHODOLOGY } from './methodology.js';
import type { AtomizeEmitPlan, EmitExistingNote, CortexConfig } from '../types.js';

const INBOX = '_inbox';

/** Curated types/folders + all existing notes — the vault context every worksheet carries. */
export function gatherVaultContext(vaultDir: string, config: CortexConfig): {
  knownTypes: string[]; knownFolders: string[]; existing: EmitExistingNote[];
} {
  const notes = scanVault(vaultDir, config); // already excludes Markdown/ (sourcesDir)
  const curated = notes.filter(n => n.folder !== INBOX);
  const knownTypes = [...new Set(curated.map(n => n.type).filter((t): t is string => !!t))].sort();
  const knownFolders = [...new Set(curated.map(n => n.folder).filter((f): f is string => !!f))].sort();
  const existing: EmitExistingNote[] = notes.map(n => ({
    id: n.id, title: n.title, path: n.path, type: n.type, folder: n.folder,
  }));
  return { knownTypes, knownFolders, existing };
}

export function emitPlan(vaultDir: string, sourcePath: string, config: CortexConfig): AtomizeEmitPlan {
  const source = basename(sourcePath).replace(/\.md$/i, '');
  const text = readFileSync(sourcePath, 'utf8');
  const segments = segmentSource(text);
  const { knownTypes, knownFolders, existing } = gatherVaultContext(vaultDir, config);
  return {
    source,
    sourcePath,
    lang: config.lang,
    fields: config.fields,
    statusFirst: config.statusLifecycle[0] ?? 'draft',
    knownTypes,
    knownFolders,
    existing,
    segments,
    instructions: DISTILL_METHODOLOGY,
  };
}
