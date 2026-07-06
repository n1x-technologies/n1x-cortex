#!/usr/bin/env node
// Grounded-vs-closed-book eval: does feeding a model Cortex's cited notes stop
// it hallucinating? Ask the SAME model project-specific facts two ways —
// (a) closed-book, no context; (b) grounded with the top-3 Cortex notes in full
// (the realistic `query -> get_note` path) — and score correctness objectively.
// Answers are facts NOT in the model's pretraining, so closed-book must guess.
//
// Requires a local OpenAI-style/ollama endpoint. Usage:
//   VAULT=/path/to/vault MODEL=llama3.1:latest node bench/grounding-eval.mjs
//   (optional) OLLAMA_URL=http://localhost:11434  CORTEX_CLI=/path/to/dist/cli.js
//
// The QUESTIONS below are the Cortex-specific facts used for the published
// numbers; swap them for facts stated in YOUR vault to eval your own corpus.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = process.env.CORTEX_CLI || resolve(here, '../toolkit/dist/cli.js');
const VAULT = process.env.VAULT;
const MODEL = process.env.MODEL || 'llama3.1:latest';
const OLLAMA = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
if (!VAULT) { console.error('Set VAULT=/path/to/vault'); process.exit(1); }

const Q = [
  { q: 'In N1X Cortex, what is the default per-session write cap for the MCP server?', ok: /\b100\b/ },
  { q: 'What is the default embedding model N1X Cortex uses?', ok: /multilingual-e5-small/i },
  { q: 'In Cortex, which folder do freshly atomized draft notes land in?', ok: /_inbox/i },
  { q: 'In Cortex, which directory holds immutable source files that are never modified?', ok: /markdown\//i },
  { q: 'What fusion algorithm does Cortex use to combine lexical and semantic retrieval?', ok: /rrf|reciprocal rank fusion/i },
  { q: 'In Cortex atomize, an in-place update is skipped if the new body is shorter than what fraction of the existing note?', ok: /\b50\s*%|\bhalf\b|0\.5\b/i },
  { q: 'What single Cortex command reverses the latest write run?', ok: /cortex undo|\bundo\b/i },
  { q: 'What are the two write scopes exposed by `cortex mcp --write`?', ok: /draft/i, ok2: /curate/i },
];

async function ask(system, user) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, stream: false, options: { temperature: 0 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  return ((await res.json()).message?.content || '').trim();
}

function context(q) {
  const out = execFileSync('node', [CLI, 'query', q, '--json'], { cwd: VAULT, encoding: 'utf8', maxBuffer: 8e6 });
  const hits = (JSON.parse(out).hits || []).slice(0, 3);
  return hits.map(h => {
    let body = h.excerpt || '';
    try { body = readFileSync(join(VAULT, h.path), 'utf8'); } catch { /* keep excerpt */ }
    return `### Source: ${h.path}\n${body.slice(0, 1800)}`;
  }).join('\n\n');
}

const score = (a, it) => ({
  correct: it.ok.test(a) && (!it.ok2 || it.ok2.test(a)),
  idk: /i don'?t know|not sure|no information|cannot determine|unable to/i.test(a),
});
const SYS_CB = 'You answer questions about N1X Cortex software. Answer in one short sentence. If you do not know, say exactly "I don\'t know."';
const SYS_G = 'Answer using ONLY the provided context from the N1X Cortex knowledge base. One short sentence. If the context lacks the answer, say "I don\'t know."';

const t = { cb: { c: 0, w: 0 }, gr: { c: 0, w: 0 } };
for (const it of Q) {
  const a = await ask(SYS_CB, it.q);
  const b = await ask(SYS_G, `Context:\n${context(it.q)}\n\nQuestion: ${it.q}`);
  const sa = score(a, it), sb = score(b, it);
  t.cb.c += sa.correct ? 1 : 0; t.cb.w += (!sa.correct && !sa.idk) ? 1 : 0;
  t.gr.c += sb.correct ? 1 : 0; t.gr.w += (!sb.correct && !sb.idk) ? 1 : 0;
  console.log(`  ${sa.correct ? 'OK ' : sa.idk ? 'idk' : 'WRONG'} -> ${sb.correct ? 'OK ' : sb.idk ? 'idk' : 'WRONG'}  ${it.q.slice(0, 56)}`);
}
const p = n => Math.round(100 * n / Q.length);
console.log(`\nmodel ${MODEL} · N=${Q.length}`);
console.log(`CLOSED-BOOK: ${p(t.cb.c)}% correct · ${p(t.cb.w)}% confidently wrong (hallucinated)`);
console.log(`GROUNDED   : ${p(t.gr.c)}% correct · ${p(t.gr.w)}% confidently wrong (hallucinated)`);
