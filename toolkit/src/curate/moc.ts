// toolkit/src/curate/moc.ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { scanVault } from '../vault.js';
import { backupNote } from '../atomize/backup.js';
import type { CortexConfig, Note } from '../types.js';

export interface MocGroup { name: string; entries: { id: string; title: string }[] }
export interface MocPlan { topic: string; dest: string; groups: MocGroup[]; count: number }

export function selectTopicNotes(notes: Note[], config: CortexConfig, topic: string): Note[] {
  const t = topic.toLowerCase();
  return notes.filter(n =>
    n.folder !== config.mocDir &&
    (n.tags.some(tag => tag.toLowerCase() === t) || (n.type ?? '').toLowerCase() === t || n.folder.toLowerCase() === t),
  );
}

export function planMoc(vaultDir: string, config: CortexConfig, topic: string): MocPlan {
  const selected = selectTopicNotes(scanVault(vaultDir, config), config, topic);
  const byGroup = new Map<string, { id: string; title: string }[]>();
  for (const n of selected) {
    const name = n.type ?? n.folder;
    (byGroup.get(name) ?? byGroup.set(name, []).get(name)!).push({ id: n.id, title: n.title });
  }
  const groups: MocGroup[] = [...byGroup.entries()]
    .map(([name, entries]) => ({ name, entries: entries.sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { topic, dest: `${config.mocDir}/${topic}.md`, groups, count: selected.length };
}

export function renderMoc(plan: MocPlan): string {
  const lines = [
    '---',
    'type: moc',
    'status: draft',
    `title: "${plan.topic} — MOC"`,
    '---',
    '',
    `# ${plan.topic} — MOC`,
    '',
    `Map of content for **${plan.topic}** · ${plan.count} note(s).`,
    '',
  ];
  for (const g of plan.groups) {
    lines.push(`## ${g.name}`, '');
    for (const e of g.entries) lines.push(`- [[${e.id}|${e.title}]]`);
    lines.push('');
  }
  return lines.join('\n');
}

function makeRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function applyMoc(
  vaultDir: string,
  plan: MocPlan,
  config: CortexConfig,
  opts: { dryRun?: boolean; runId?: string } = {},
): { written: string | null; backup: string | null } {
  const dryRun = opts.dryRun ?? true;
  if (dryRun) return { written: null, backup: null };

  const abs = resolve(vaultDir, plan.dest);
  const sourcesAbs = resolve(vaultDir, config.sourcesDir.replace(/\/$/, ''));
  if (abs === sourcesAbs || abs.startsWith(sourcesAbs + sep)) return { written: null, backup: null };

  const runId = opts.runId ?? makeRunId();
  const backup = existsSync(abs) ? backupNote(vaultDir, plan.dest, runId) : null;
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, renderMoc(plan));
  return { written: plan.dest, backup };
}
