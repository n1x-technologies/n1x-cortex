import { existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { ensureCortexIgnored } from '../gitignore.js';
import type { CortexConfig } from '../types.js';

/**
 * A generic starter note template built from the vault's inferred field names,
 * so `cortex new note <id>` works immediately after init. The `type: note`
 * value matches the `note.md` filename; the `{{…}}` tokens are filled by
 * `cortex new`. Users edit this to match their own frontmatter schema.
 */
function starterTemplate(config: CortexConfig): string {
  const { type, id, status } = config.fields;
  return [
    '---',
    `${type}: note`,
    `${id}: {{id}}`,
    `${status}: {{status}}`,
    'created: {{date}}',
    '---',
    '# {{title}}',
    '',
    'Write the note body here. Link related notes with [[wikilinks]].',
    '',
  ].join('\n');
}

/**
 * Seed `<templatesDir>/note.md` when the vault has no templates yet. Never
 * overwrites: if the templates dir already holds any `.md`, the vault owns its
 * schema and we leave it alone. Returns whether a template was written.
 */
function seedStarterTemplate(vaultDir: string, config: CortexConfig): boolean {
  const dir = join(vaultDir, config.templatesDir);
  const hasTemplates = existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.md'));
  if (hasTemplates) return false;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'note.md'), starterTemplate(config));
  return true;
}

export function runInit(vaultDir: string): { created: boolean; gitignoreUpdated: boolean; templateSeeded: boolean; config: CortexConfig } {
  const keys = collectFrontmatterKeys(vaultDir);
  const config = loadConfig(vaultDir, keys);
  const gitignoreUpdated = ensureCortexIgnored(vaultDir);
  const templateSeeded = seedStarterTemplate(vaultDir, config);
  const file = join(vaultDir, '.cortex.json');
  if (existsSync(file)) return { created: false, gitignoreUpdated, templateSeeded, config };
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return { created: true, gitignoreUpdated, templateSeeded, config };
}
