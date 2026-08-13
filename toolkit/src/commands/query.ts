import { loadConfig } from '../config.js';
import { scanVault, collectFrontmatterKeys } from '../vault.js';
import { buildGraph } from '../graph.js';
import { retrieve } from '../query/retrieve.js';
import { semanticQueryRanking } from '../semantic/queryRank.js';
import type { QueryResult } from '../types.js';
import type { Embedder } from '../semantic/embedder.js';

export const QUERY_USAGE =
  'Usage: cortex query <question> [--json] [--limit <n>] [--full | --max-content <n>]';

export interface QueryArgs {
  question: string;
  json: boolean;
  /** Undefined means the engine default. */
  limit?: number;
  /** Undefined means no `content` field at all; a number caps it; 'full' is unbounded. */
  content?: number | 'full';
}

/**
 * Parses the argv tail of `cortex query`.
 *
 * The previous implementation was `rest.filter(a => a !== '--json').join(' ')`,
 * which made every unrecognised token part of the question. `cortex query
 * "first crack" --limit 4` searched for `first crack --limit 4`: the user got
 * no error, just quietly worse retrieval, and no way to tell that had happened.
 * An unknown option is therefore a hard error now.
 *
 * That trade costs something — a question containing a flag-looking word is no
 * longer askable directly — so a bare `--` ends option parsing and everything
 * after it is literal text, the usual convention.
 */
export function parseQueryArgs(argv: string[]): QueryArgs {
  const words: string[] = [];
  let json = false;
  let limit: number | undefined;
  let content: number | 'full' | undefined;
  let sawFull = false;
  let sawMaxContent = false;

  // Reads the value of a flag that takes one. Kept as a closure so "missing
  // value" is reported against the flag the user actually typed rather than
  // surfacing as a confusing parse of the next token.
  const valueFor = (flag: string, i: number): string => {
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${flag} needs a value — ${QUERY_USAGE}`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];

    if (tok === '--') {
      words.push(...argv.slice(i + 1));
      break;
    }

    // `-` and `-5` are question text, not options: a lone hyphen is a word and
    // a negative number is a plausible thing to ask about. Only `--x` is an
    // option, which is also why there are no short flags here to collide.
    if (!tok.startsWith('--')) {
      words.push(tok);
      continue;
    }

    switch (tok) {
      case '--json':
        json = true;
        break;
      case '--full':
        sawFull = true;
        content = 'full';
        break;
      case '--limit': {
        const raw = valueFor(tok, i);
        i++;
        // Integer and >= 1. A 0 or negative limit is not a smaller result set,
        // it is a request the engine cannot express, and silently clamping it
        // would hide a scripting bug in whatever built the command line.
        if (!/^\d+$/.test(raw) || Number(raw) < 1) {
          throw new Error(`--limit must be a positive integer, got "${raw}"`);
        }
        limit = Number(raw);
        break;
      }
      case '--max-content': {
        const raw = valueFor(tok, i);
        i++;
        // 0 IS meaningful here, unlike --limit: it means "include the field,
        // empty", which lets a consumer keep one output shape across calls.
        if (!/^\d+$/.test(raw)) {
          throw new Error(`--max-content must be a non-negative integer, got "${raw}"`);
        }
        sawMaxContent = true;
        content = Number(raw);
        break;
      }
      default:
        throw new Error(`unknown option "${tok}" — ${QUERY_USAGE}`);
    }
  }

  // Order-independent: whichever came last would otherwise win silently, and
  // the two mean contradictory things.
  if (sawFull && sawMaxContent) {
    throw new Error(`--full and --max-content are mutually exclusive — ${QUERY_USAGE}`);
  }

  const question = words.join(' ').trim();
  if (!question) throw new Error(`missing question — ${QUERY_USAGE}`);

  return { question, json, limit, content };
}

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
  opts: { limit?: number; content?: number | 'full' } = {},
): Promise<QueryResult> {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const notes = scanVault(vaultDir, config);
  const graph = buildGraph(notes);
  const semanticRanking = await semanticQueryRanking(vaultDir, config, notes, question, embedder);
  return retrieve(notes, graph, question, {
    semanticRanking,
    rrfK: config.rrfK,
    // Undefined leaves the engine default in place rather than overriding it
    // with a value the caller never supplied.
    maxHits: opts.limit,
    content: opts.content,
  });
}

/** Machine-readable rendering of a query result — for the /query skill and other agents. */
export function formatQueryJson(r: QueryResult): string {
  return JSON.stringify(r, null, 2);
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
