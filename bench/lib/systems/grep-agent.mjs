// What an agent does today WITHOUT Cortex: grep the corpus, read what looks
// relevant, answer. This is the real competitor, so it is built to be
// competent — a good system prompt, three useful tools, and a generous turn
// budget. A crippled version here would invalidate the entire comparison.
//
// LIMITATION (must be stated in the published report): the toolkit LLM client
// exposes only complete(system, user), with no native tool-calling API, so
// this is a text-protocol ReAct loop. A native function-calling agent would
// likely do somewhat better.
//
// MEASUREMENT NOTE (must be stated in the published report): every path
// returned by a GREP observation is added to citedPaths, whether or not the
// agent goes on to READ it. That is generous to this baseline — it credits
// recall for files the agent merely saw listed in a grep hit, not only files
// it actually consumed — but it is deliberate: a crippled measurement here
// would reintroduce the strawman this redesign exists to remove.
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { walkVault } from '../corpus.mjs';
import { countTokens } from '../tokenizer.mjs';

export const name = 'grep-agent';
export const MAX_TURNS = 10;
const MAX_READ_CHARS = 4000;
const MAX_GREP_HITS = 20;

const SYSTEM = `You are answering a question using a folder of markdown files.

Available actions, one per reply, as the LAST line of your reply:
  LIST:                 list every file
  GREP: <text>          find files containing <text> (case-insensitive)
  READ: <path>          read a file by its listed path
  ANSWER: <answer>      give the final answer in one short sentence

Work efficiently: grep for distinctive terms, read only the files that look
relevant, then answer. If the files do not contain the answer, reply
ANSWER: I don't know.`;

/** @returns {{tool: string, arg: string}|null} */
export function parseAction(raw) {
  const lines = (raw || '').trim().split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^(LIST|GREP|READ|ANSWER):\s*(.*)$/i.exec(lines[i]);
    if (m) return { tool: m[1].toLowerCase(), arg: m[2].trim() };
  }
  return null;
}

export function executeTool(tool, arg, vaultDir) {
  if (tool === 'list') {
    return walkVault(vaultDir).map(p => relative(vaultDir, p)).join('\n');
  }

  if (tool === 'grep') {
    const needle = arg.toLowerCase();
    const hits = [];
    for (const abs of walkVault(vaultDir)) {
      const text = readFileSync(abs, 'utf8');
      const line = text.split('\n').find(l => l.toLowerCase().includes(needle));
      if (line) hits.push(`${relative(vaultDir, abs)}: ${line.trim()}`);
      if (hits.length >= MAX_GREP_HITS) break;
    }
    return hits.length ? hits.join('\n') : 'no matches';
  }

  if (tool === 'read') {
    const vaultAbs = resolve(vaultDir);
    const abs = resolve(vaultDir, arg);
    // Resolution 4: a string-prefix check here (`abs.startsWith(vaultAbs)`)
    // is wrong — a sibling directory whose name merely starts with the
    // vault's name (e.g. vault `/x/ci-vault`, path `/x/ci-vault-evil/f.md`)
    // would pass it. relative() gives the real path relationship: escaping
    // the vault always produces a `..`-prefixed (or, cross-device, absolute)
    // result.
    const rel = relative(vaultAbs, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) return 'error: path is outside the vault';
    try {
      return readFileSync(abs, 'utf8').slice(0, MAX_READ_CHARS);
    } catch {
      return `error: cannot read ${arg}`;
    }
  }

  return `error: unknown tool ${tool}`;
}

export async function run(question, ctx) {
  const t0 = performance.now();
  const transcript = [`Question: ${question}`];
  const citedPaths = [];
  let retrievalTokens = 0;
  let finalPayload = '';

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const user = transcript.join('\n\n');
    retrievalTokens += countTokens(SYSTEM) + countTokens(user);

    const reply = await ctx.llm.complete(SYSTEM, user);
    retrievalTokens += countTokens(reply);

    const action = parseAction(reply);
    if (!action) break;

    if (action.tool === 'answer') {
      // The payload the agent actually built for itself: everything it read.
      finalPayload = transcript.slice(1).join('\n\n');
      break;
    }

    if (action.tool === 'read' && !citedPaths.includes(action.arg)) citedPaths.push(action.arg);

    const observation = executeTool(action.tool, action.arg, ctx.vaultDir);

    if (action.tool === 'grep') {
      for (const line of observation.split('\n')) {
        const path = line.split(':')[0];
        if (path.endsWith('.md') && !citedPaths.includes(path)) citedPaths.push(path);
      }
    }

    transcript.push(`${action.tool.toUpperCase()}: ${action.arg}\nResult:\n${observation}`);
  }

  if (!finalPayload) finalPayload = transcript.slice(1).join('\n\n');

  return { promptPayload: finalPayload, citedPaths, latencyMs: performance.now() - t0, retrievalTokens };
}
