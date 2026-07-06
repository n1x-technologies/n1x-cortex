import { describe, it, expect } from 'vitest';
import { proposeNotes, slug } from '../src/atomize/propose.js';
import { loadConfig } from '../src/config.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const cfg = loadConfig(mkdtempSync(`${tmpdir()}/cortex-p-`), ['tipo', 'estado']); // statusLifecycle default ['draft','documented','verified']

describe('slug', () => {
  it('kebab-cases and strips accents/punctuation', () => {
    expect(slug('Límite de Operación X!')).toBe('limite-de-operacion-x');
  });
});

describe('proposeNotes', () => {
  it('maps each segment to a draft NoteSpec citing the source', () => {
    const specs = proposeNotes(
      [{ heading: 'Operation limit', level: 2, body: 'The limit is 5.' }],
      'FUENTE-rules', cfg,
    );
    expect(specs).toHaveLength(1);
    expect(specs[0].title).toBe('Operation limit');
    expect(specs[0].id).toBe('operation-limit');
    expect(specs[0].body).toBe('The limit is 5.');
    expect(specs[0].source).toBe('FUENTE-rules');
    expect(specs[0].status).toBe('draft');     // first lifecycle stage
  });
});
