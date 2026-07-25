// The whole corpus in the prompt: the quality ceiling and the cost floor.
// With million-token context windows this is the honest competitor, not the
// strawman the old bench used it as.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const name = 'full-context';

// Every Cortex system scans the vault through the toolkit's scanVault, which
// honours config.templatesDir and so never sees the scaffold. full-context
// must skip the same directory or it is scanning a different corpus than
// every retriever it's compared against.
function readTemplatesDir(vaultDir) {
  try {
    const config = JSON.parse(readFileSync(join(vaultDir, '.cortex.json'), 'utf8'));
    return config.templatesDir ?? '_templates';
  } catch {
    return '_templates';
  }
}

function walk(dir, excludeAbs, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (p === excludeAbs) continue;
    if (statSync(p).isDirectory()) walk(p, excludeAbs, acc);
    else if (entry.endsWith('.md')) acc.push(p);
  }
  return acc;
}

function walkVault(vaultDir) {
  const excludeAbs = join(vaultDir, readTemplatesDir(vaultDir));
  return walk(vaultDir, excludeAbs);
}

/** Every markdown note in the vault, labelled by path. Cache this — it is expensive. */
export function loadCorpusText(vaultDir) {
  return walkVault(vaultDir)
    .map(abs => `### ${relative(vaultDir, abs)}\n${readFileSync(abs, 'utf8')}`)
    .join('\n\n');
}

export function loadCorpusPaths(vaultDir) {
  return walkVault(vaultDir).map(abs => relative(vaultDir, abs));
}

export async function run(question, ctx) {
  const t0 = performance.now();
  const promptPayload = ctx.corpusText ?? loadCorpusText(ctx.vaultDir);
  const latencyMs = performance.now() - t0;

  return {
    promptPayload,
    citedPaths: loadCorpusPaths(ctx.vaultDir),
    latencyMs,
    retrievalTokens: 0,
  };
}
