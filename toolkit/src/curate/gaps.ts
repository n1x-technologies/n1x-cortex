// toolkit/src/curate/gaps.ts
import { scanVault } from '../vault.js';
import { snapshotSources, type HookState } from '../hooks/state.js';
import type { CortexConfig } from '../types.js';

export interface GapsReport {
  unatomizedSources: string[];
  staleSources: string[];
  notesMissingCitation: string[];
  stuckDrafts: string[];
}

function sourceKey(s: string): string {
  return s.replace(/\[\[|\]\]/g, '').split(/[\\/]/).pop()!.replace(/\.md$/i, '').trim().toLowerCase();
}

export function computeGaps(vaultDir: string, config: CortexConfig, state: HookState): GapsReport {
  const notes = scanVault(vaultDir, config);
  const live = snapshotSources(vaultDir, config);
  const sourceRel = Object.keys(live);
  const citedKeys = new Set(notes.map(n => n.source).filter((s): s is string => !!s).map(sourceKey));

  const unatomizedSources = sourceRel.filter(rel => !citedKeys.has(sourceKey(rel))).sort();
  const staleSources = sourceRel
    .filter(rel => citedKeys.has(sourceKey(rel)) && state.sources[rel] !== undefined && live[rel] > state.sources[rel])
    .sort();
  const notesMissingCitation = notes
    .filter(n => n.source == null && n.type !== 'moc' && n.folder !== config.mocDir)
    .map(n => n.path).sort();
  const draft = config.statusLifecycle[0];
  const stuckDrafts = notes.filter(n => n.status === draft).map(n => n.path).sort();

  return { unatomizedSources, staleSources, notesMissingCitation, stuckDrafts };
}
