// toolkit/src/curate/verify.ts
import { basename } from 'node:path';
import { scanVault } from '../vault.js';
import type { CortexConfig, Note } from '../types.js';

export interface VerifyItem { target: string; exists: boolean; cited: boolean; verified: boolean }
export interface VerifyReport { root: string; hops: number; items: VerifyItem[]; ok: boolean }
export interface VerifyAllReport {
  total: number;
  incomplete: { path: string; gaps: number; targets: number }[];
}

function stem(p: string): string { return basename(p).replace(/\.md$/i, ''); }

function buildResolver(notes: Note[]): Map<string, Note> {
  const resolver = new Map<string, Note>();
  for (const n of notes) {
    for (const k of [n.id, n.title, stem(n.path)]) if (k) resolver.set(k, n);
  }
  return resolver;
}

/** BFS over a single note's link closure against a pre-built resolver. */
function verifyFrom(root: Note, resolver: Map<string, Note>, lastStatus: string | undefined, hops: number): VerifyReport {
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
          items.push({ target: t, exists: true, cited: resolved.source != null, verified: resolved.status === lastStatus });
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

export function verifyNote(vaultDir: string, config: CortexConfig, notePath: string, hops: number): VerifyReport {
  const notes = scanVault(vaultDir, config);
  const resolver = buildResolver(notes);
  const root = notes.find(n => n.path === notePath || stem(n.path) === stem(notePath));
  if (!root) return { root: notePath, hops, items: [], ok: false };
  const last = config.statusLifecycle[config.statusLifecycle.length - 1];
  return verifyFrom(root, resolver, last, hops);
}

/**
 * Verify the whole vault in one scan: every note's link closure is checked and
 * the ones with dangling targets (gaps) are returned, worst first. A vault-wide
 * "what still needs work" checklist.
 */
export function verifyAll(vaultDir: string, config: CortexConfig, hops: number): VerifyAllReport {
  const notes = scanVault(vaultDir, config);
  const resolver = buildResolver(notes);
  const last = config.statusLifecycle[config.statusLifecycle.length - 1];
  const incomplete = notes
    .map(n => {
      const r = verifyFrom(n, resolver, last, hops);
      const gaps = r.items.filter(i => !i.exists).length;
      return { path: n.path, gaps, targets: r.items.length };
    })
    .filter(r => r.gaps > 0)
    .sort((a, b) => b.gaps - a.gaps || a.path.localeCompare(b.path));
  return { total: notes.length, incomplete };
}
