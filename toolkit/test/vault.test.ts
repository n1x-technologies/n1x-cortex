import { describe, it, expect } from 'vitest';
import { scanVault, collectFrontmatterKeys } from '../src/vault.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-vault-'));
  mkdirSync(join(dir, '01-Conceptos'));
  mkdirSync(join(dir, 'Markdown'));
  mkdirSync(join(dir, '_templates'));
  writeFileSync(join(dir, '01-Conceptos', 'a.md'), '---\ntipo: concepto\n---\n# A\n[[B]]');
  writeFileSync(join(dir, 'Markdown', 'source.md'), '# Raw source (excluded)');
  writeFileSync(
    join(dir, '_templates', 'nota-template.md'),
    '---\ntipo: concepto\nid: XXX-NOMBRE-00\n---\n# {{title}}\n[[nota-relacionada-1]]',
  );
  return dir;
}

describe('vault', () => {
  it('collects distinct frontmatter keys', () => {
    expect(collectFrontmatterKeys(fixture())).toContain('tipo');
  });
  it('scans notes and excludes the sources dir', () => {
    const dir = fixture();
    const cfg = loadConfig(dir, ['tipo']);
    const notes = scanVault(dir, cfg);
    expect(notes.map(n => n.path)).toEqual(['01-Conceptos/a.md']);
    expect(notes[0].type).toBe('concepto');
  });
  it('excludes the templates dir — a template is never counted as a note', () => {
    const dir = fixture();
    const cfg = loadConfig(dir, ['tipo']);
    const notes = scanVault(dir, cfg);
    expect(notes.map(n => n.path)).toEqual(['01-Conceptos/a.md']);
    expect(notes.some(n => n.path.startsWith(`${cfg.templatesDir}/`))).toBe(false);
    expect(notes.some(n => n.id === 'XXX-NOMBRE-00')).toBe(false);
  });
});
