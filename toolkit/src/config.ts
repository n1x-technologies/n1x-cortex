import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_LIFECYCLE } from './types.js';
import type { CortexConfig, CortexFields } from './types.js';

const CANDIDATES = {
  type: ['type', 'tipo', 'tipo_nota'],
  status: ['status', 'estado'],
  id: ['id', 'uid'],
  source: ['source', 'fuente', 'origen'],
};

export function inferFields(keys: string[]): CortexFields {
  const pick = (opts: string[], fallback: string) => opts.find(o => keys.includes(o)) ?? fallback;
  return {
    type: pick(CANDIDATES.type, 'type'),
    status: pick(CANDIDATES.status, 'status'),
    id: pick(CANDIDATES.id, 'id'),
    source: pick(CANDIDATES.source, 'source'),
  };
}

export function loadConfig(vaultDir: string, sampleKeys: string[] = []): CortexConfig {
  const fields = inferFields(sampleKeys);
  const defaults: CortexConfig = {
    vaultRoot: '.',
    sourcesDir: 'Markdown',
    lang: null,
    fields,
    statusLifecycle: [...DEFAULT_LIFECYCLE],
    immutableStatus: null,
    autonomy: 'auto-draft',
    mocDir: '00-MOC',
    dupeThreshold: 0.45,
    embedModel: 'Xenova/multilingual-e5-small',
    embedDir: '.cortex/embeddings',
    semanticDupeThreshold: 0.85,
    rrfK: 60,
    outDir: '.cortex/out',
    captureCooldownMs: 60000,
    maxCapturesPerSession: 20,
    captureMaxRunMs: 900000,
    claudeBin: 'claude',
    viz: { port: 4317 },
  };

  const file = join(vaultDir, '.cortex.json');
  if (!existsSync(file)) return defaults;

  let override: Partial<CortexConfig>;
  try {
    override = JSON.parse(readFileSync(file, 'utf8')) as Partial<CortexConfig>;
  } catch (e) {
    throw new Error(`Invalid .cortex.json in ${vaultDir}: ${(e as Error).message}`);
  }
  return {
    ...defaults,
    ...override,
    fields: { ...defaults.fields, ...(override.fields ?? {}) },
    viz: { ...defaults.viz, ...(override.viz ?? {}) },
  };
}
