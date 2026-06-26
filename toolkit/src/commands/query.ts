import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { buildGraph } from '../graph.js';
import { retrieve } from '../query/retrieve.js';
import { semanticQueryRanking } from '../semantic/queryRank.js';
import type { QueryResult } from '../types.js';
import type { Embedder } from '../semantic/embedder.js';

export function runQuery(vaultDir: string, question: string): QueryResult {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);
  return retrieve(notes, graph, question);
}

export async function runQuerySemantic(
  vaultDir: string,
  question: string,
  embedder?: Embedder,
): Promise<QueryResult> {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);
  const semanticRanking = await semanticQueryRanking(vaultDir, config, notes, question, embedder);
  return retrieve(notes, graph, question, { semanticRanking, rrfK: config.rrfK });
}

export function formatQuery(r: QueryResult): string {
  const lines: string[] = [];
  lines.push(`Q: ${r.question}`);
  lines.push(`Anchors: ${r.anchors.join(', ') || '(none)'}`);
  lines.push('');
  if (r.hits.length === 0) lines.push('(no matching notes)');
  for (const h of r.hits) {
    lines.push(`• [${h.via}] ${h.title}  (${h.path})`);
    if (h.excerpt) lines.push(`    ${h.excerpt}`);
    if (h.source) lines.push(`    source: ${h.source}`);
  }
  lines.push('');
  lines.push(`Cite: ${r.sources.join(' · ') || '(none)'}`);
  return lines.join('\n');
}
