// toolkit/src/curate/verify.ts
import { basename } from 'node:path';
import { scanVault } from '../vault.js';
import type { CortexConfig, Note } from '../types.js';

export interface VerifyItem { target: string; exists: boolean; cited: boolean; verified: boolean }
export interface VerifyReport { root: string; hops: number; items: VerifyItem[]; ok: boolean }

function stem(p: string): string { return basename(p).replace(/\.md$/i, ''); }

export function verifyNote(vaultDir: string, config: CortexConfig, notePath: string, hops: number): VerifyReport {
  const notes = scanVault(vaultDir, config);
  const resolver = new Map<string, Note>();
  for (const n of notes) {
    for (const k of [n.id, n.title, stem(n.path)]) if (k) resolver.set(k, n);
  }
  const root = notes.find(n => n.path === notePath || stem(n.path) === stem(notePath));
  if (!root) return { root: notePath, hops, items: [], ok: false };

  const last = config.statusLifecycle[config.statusLifecycle.length - 1];
  const items: VerifyItem[] = [];
  const visited = new Set<string>([root.id, root.title, stem(root.path)]);
  let frontier: Note[] = [root];
  for (let h = 0; h < hops; h++) {
    const next: Note[] = [];
    for (const note of frontier) {
      for (const link of note.links) {
        const t = link.target;
        if (visited.has(t)) continue;
        visited.add(t);
        const resolved = resolver.get(t);
        if (resolved) {
          items.push({ target: t, exists: true, cited: resolved.source != null, verified: resolved.status === last });
          next.push(resolved);
        } else {
          items.push({ target: t, exists: false, cited: false, verified: false });
        }
      }
    }
    frontier = next;
  }
  return { root: root.path, hops, items, ok: items.every(i => i.exists) };
}
