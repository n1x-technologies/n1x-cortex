import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { buildNote } from './note.js';
import type { Note, CortexConfig } from './types.js';

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.toLowerCase().endsWith('.md')) acc.push(full);
  }
  return acc;
}

function relPosix(root: string, full: string): string {
  return relative(root, full).split(sep).join('/');
}

export function collectFrontmatterKeys(vaultDir: string): string[] {
  const keys = new Set<string>();
  for (const full of walk(vaultDir)) {
    const { data } = parseFrontmatter(readFileSync(full, 'utf8'));
    for (const k of Object.keys(data)) keys.add(k);
  }
  return [...keys];
}

export function scanVault(vaultDir: string, config: CortexConfig): Note[] {
  const sources = config.sourcesDir.replace(/\/$/, '');
  const templates = config.templatesDir.replace(/\/$/, '');
  const notes: Note[] = [];
  for (const full of walk(vaultDir)) {
    const rel = relPosix(vaultDir, full);
    // Raw sources and templates are never notes — excluding templates here keeps
    // their frontmatter and placeholder [[links]] out of the graph, status, etc.
    if (rel === `${sources}` || rel.startsWith(`${sources}/`)) continue;
    if (rel === `${templates}` || rel.startsWith(`${templates}/`)) continue;
    notes.push(buildNote(rel, readFileSync(full, 'utf8'), config.fields));
  }
  return notes.sort((a, b) => a.path.localeCompare(b.path));
}
