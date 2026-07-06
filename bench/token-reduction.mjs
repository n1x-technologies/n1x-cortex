#!/usr/bin/env node
// Measure Cortex's per-query token reduction on any vault: the cost of dumping
// the whole knowledge base into a prompt vs. the cost of `cortex query`'s cited
// retrieval. Token counts use the standard ~4-chars/token approximation.
//
// Usage:
//   VAULT=/path/to/vault node bench/token-reduction.mjs
//   VAULT=... QUESTIONS="q1|q2|q3" CORTEX_CLI=/path/to/dist/cli.js node bench/token-reduction.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = process.env.CORTEX_CLI || resolve(here, '../toolkit/dist/cli.js');
const VAULT = process.env.VAULT;
if (!VAULT) { console.error('Set VAULT=/path/to/vault (a folder of .md notes, `cortex init`-ed).'); process.exit(1); }

const QUESTIONS = (process.env.QUESTIONS || [
  'how does it work',
  'what is the main concept',
  'how are things configured',
  'what are the safety guarantees',
  'how does it handle errors',
].join('|')).split('|');

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (e.endsWith('.md')) acc.push(p);
  }
  return acc;
}

const files = walk(VAULT);
const chars = files.reduce((s, f) => s + readFileSync(f, 'utf8').length, 0);
const corpusTokens = Math.round(chars / 4);

let total = 0;
for (const q of QUESTIONS) {
  const out = execFileSync('node', [CLI, 'query', q, '--json'], { cwd: VAULT, encoding: 'utf8', maxBuffer: 8e6 });
  total += Math.round(out.length / 4);
}
const avg = Math.round(total / QUESTIONS.length);
const reduction = (100 * (1 - avg / corpusTokens)).toFixed(2);
const mult = Math.round(corpusTokens / avg);

console.log(`corpus                : ${files.length} md files, ~${corpusTokens.toLocaleString()} tokens (chars/4)`);
console.log(`whole-vault dump      : ~${corpusTokens.toLocaleString()} tokens / query`);
console.log(`cortex cited retrieval: ~${avg.toLocaleString()} tokens / query (avg of ${QUESTIONS.length})`);
console.log(`REDUCTION             : ${reduction}% fewer tokens per query  ·  ${mult}x less context`);
