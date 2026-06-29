import { dirname } from 'node:path';
import type { Note } from './types.js';

export interface TemplateVars {
  id: string;
  title: string;
  module: string;
  date: string;
  status: string;
}

/**
 * Fill a template's `{{placeholder}}` tokens. The vault owns its frontmatter
 * shape (the template file); Cortex only substitutes the standard tokens, so
 * `cortex new` stays schema-agnostic. Unknown tokens are left untouched.
 */
export function fillTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*(id|title|module|date|status)\s*\}\}/g, (_, key: keyof TemplateVars) => vars[key]);
}

/**
 * Infer the destination folder for a new note of `type` by learning where
 * existing notes of that type live (the most common directory). Returns null
 * when nothing can be inferred (no existing notes of that type) — the caller
 * should then ask for an explicit `--dir`.
 */
export function resolveTypeDir(notes: Note[], type: string, override?: string): string | null {
  if (override) return override;
  const counts = new Map<string, number>();
  for (const n of notes) {
    if ((n.type ?? '') !== type) continue;
    const d = dirname(n.path);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}
