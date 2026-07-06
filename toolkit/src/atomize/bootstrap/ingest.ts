// toolkit/src/atomize/bootstrap/ingest.ts
//
// Turn one repo file into an AtomizeEmitPlan worksheet — the same shape emit.ts
// produces for markdown, so it flows through distillWorksheetWithLlm and
// applyDistilledInput unchanged. Routes by kind: docs reuse the heading
// segmenter + prose methodology; code becomes whole-file (or chunked) segments
// + the code methodology. The worksheet's `source` is the repo-relative path,
// which the toolkit renders as each note's citation.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { segmentSource } from '../segment.js';
import { gatherVaultContext } from '../emit.js';
import { chunkCode } from './chunk.js';
import { DISTILL_METHODOLOGY, DISTILL_METHODOLOGY_CODE } from '../methodology.js';
import type { AtomizeEmitPlan, Segment, CortexConfig } from '../../types.js';

const CODE_CHUNK_CHARS = 24_000;

export function buildWorksheet(
  vaultDir: string,
  filePath: string,
  kind: 'doc' | 'code',
  config: CortexConfig,
): AtomizeEmitPlan {
  const text = readFileSync(join(vaultDir, filePath), 'utf8');
  const segments: Segment[] = kind === 'doc'
    ? segmentSource(text)
    : chunkCode(text, CODE_CHUNK_CHARS).map((body, i) => ({
        heading: `${filePath}${i > 0 ? ` (part ${i + 1})` : ''}`,
        level: 1,
        body,
      }));
  const { knownTypes, knownFolders, existing } = gatherVaultContext(vaultDir, config);
  return {
    source: filePath, // repo-relative path → citation
    sourcePath: join(vaultDir, filePath),
    lang: config.lang,
    fields: config.fields,
    statusFirst: config.statusLifecycle[0] ?? 'draft',
    knownTypes,
    knownFolders,
    existing,
    segments,
    instructions: kind === 'code' ? DISTILL_METHODOLOGY_CODE : DISTILL_METHODOLOGY,
  };
}
