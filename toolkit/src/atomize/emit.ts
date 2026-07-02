import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { segmentSource } from './segment.js';
import { scanVault } from '../vault.js';
import { DISTILL_METHODOLOGY } from './methodology.js';
import type { AtomizeEmitPlan, EmitExistingNote, CortexConfig } from '../types.js';

const INBOX = '_inbox';

export function emitPlan(vaultDir: string, sourcePath: string, config: CortexConfig): AtomizeEmitPlan {
  const source = basename(sourcePath).replace(/\.md$/i, '');
  const text = readFileSync(sourcePath, 'utf8');
  const segments = segmentSource(text);

  const notes = scanVault(vaultDir, config); // already excludes Markdown/ (sourcesDir)
  const curated = notes.filter(n => n.folder !== INBOX);

  const knownTypes = [...new Set(
    curated.map(n => n.type).filter((t): t is string => !!t),
  )].sort();
  const knownFolders = [...new Set(
    curated.map(n => n.folder).filter((fld): fld is string => !!fld),
  )].sort();

  const existing: EmitExistingNote[] = notes.map(n => ({
    id: n.id, title: n.title, path: n.path, type: n.type, folder: n.folder,
  }));

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
