#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { createRequire } from 'node:module';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runOrphans } from './commands/orphans.js';
import { runViz, openBrowser } from './commands/viz.js';
import { runQuery, runQuerySemantic, formatQuery, formatQueryJson } from './commands/query.js';
import { runAtomize, formatPlan, runEmit, runApply, formatDistilledPlan, runUndo } from './commands/atomize.js';
import { runPromote, formatPromote, runSetStatus } from './commands/promote.js';
import { runHookCommand } from './commands/hook.js';
import { runPause, runResume } from './commands/pause.js';
import { runEmbed, formatEmbed } from './commands/embed.js';
import { runGaps, formatGaps } from './commands/gaps.js';
import { runDupes, formatDupes, formatDupesJson } from './commands/dupes.js';
import { runMerge, formatMerge } from './commands/merge.js';
import { runVerify, formatVerify, runVerifyAll, formatVerifyAll } from './commands/verify.js';
import { runMoc, formatMoc } from './commands/moc.js';
import { runDoc, formatDoc } from './commands/doc.js';
import { runMcp, runMcpInstall, runMcpUninstall, parseWriteScope } from './commands/mcp.js';
import { runNew, formatNew } from './commands/new.js';

const USAGE = 'Usage: cortex <init|new|status|orphans|viz|query|atomize|promote|undo|set-status|hook|pause|resume|embed|mcp|gaps|dupes|merge|verify|moc|doc>';

const MCP_HELP = `Usage: cortex mcp [install|uninstall] [--write[=draft|curate]] [--vault <path>] [--scope local|project|user]

  cortex mcp                  Start the stdio MCP server, read-only (vault = positional arg or cwd)
  cortex mcp --write          Start with write tools (draft scope: atomize→_inbox, set-status, undo)
  cortex mcp --write=curate   Also expose promote + merge (structural, still reversible)
  cortex mcp install          Register the Cortex MCP server with Claude Code
  cortex mcp uninstall        Remove the Cortex MCP registration

Options:
  --write[=draft|curate]      Enable agent write/curate tools (default: read-only)
  --vault <path>              Vault directory (default: current directory)
  --scope local|project|user  Registration scope (default: local)

Write is reversible: every change is backed up; cortex_undo / \`cortex undo\` reverses the latest run.
Verify with: claude mcp list`;

function pkgVersion(): string {
  return (createRequire(import.meta.url)('../package.json') as { version: string }).version;
}

export async function main(argv: string[]): Promise<number> {
  const [cmd] = argv;
  const cwd = process.cwd();
  if (cmd === '--version' || cmd === '-v') { console.log(pkgVersion()); return 0; }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help' || !cmd) { console.log(USAGE); return 0; }
  switch (cmd) {
    case 'init': {
      const { created, gitignoreUpdated, config } = runInit(cwd);
      console.log(created
        ? `Created .cortex.json (type=${config.fields.type}, status=${config.fields.status})`
        : '.cortex.json already exists — left unchanged');
      if (gitignoreUpdated) console.log('Added .cortex/ to .gitignore (generated cache — not committed).');
      return 0;
    }
    case 'new': {
      const rest = argv.slice(1);
      const ti = rest.indexOf('--title');
      const title = ti >= 0 ? rest[ti + 1] : undefined;
      const mi = rest.indexOf('--module');
      const module = mi >= 0 ? rest[mi + 1] : undefined;
      const di = rest.indexOf('--dir');
      const dir = di >= 0 ? rest[di + 1] : undefined;
      const flagVals = new Set([title, module, dir].filter(Boolean) as string[]);
      const [type, id] = rest.filter(a => !a.startsWith('--') && !flagVals.has(a));
      if (!type || !id) { console.log('Usage: cortex new <type> <id> [--title "..."] [--module "..."] [--dir <folder>]'); return 1; }
      const r = runNew(cwd, type, id, { title, module, dir });
      console.log(formatNew(r));
      return r.created ? 0 : 1;
    }
    case 'status': {
      const s = runStatus(cwd);
      console.log(`Notes: ${s.total}  ·  Orphans: ${s.orphans}`);
      console.log('By type:   ' + Object.entries(s.byType).map(([k, v]) => `${k}=${v}`).join('  '));
      console.log('By status: ' + Object.entries(s.byStatus).map(([k, v]) => `${k}=${v}`).join('  '));
      return 0;
    }
    case 'orphans': {
      const { gaps, sources } = runOrphans(cwd);
      console.log(`Gaps (dangling targets, atomize-next priority): ${gaps.length}`);
      for (const { target, refs } of gaps.slice(0, 30)) console.log(`  ${String(refs).padStart(3)}  ${target}`);
      if (sources.length) console.log(`Source citations (cited, not gaps): ${sources.length}`);
      return 0;
    }
    case 'viz': {
      try {
        const { url } = await runViz(cwd);
        console.log(`Cortex viewer running at ${url}`);
        console.log('Press Ctrl+C to stop.');
        openBrowser(url);
        await new Promise(() => {});
        return 0;
      } catch (e) {
        console.error(`Could not start the viewer: ${(e as Error).message}`);
        return 1;
      }
    }
    case 'query': {
      const rest = argv.slice(1);
      const json = rest.includes('--json');
      const question = rest.filter(a => a !== '--json').join(' ').trim();
      if (!question) { console.log('Usage: cortex query <question> [--json]'); return 1; }
      const result = await runQuerySemantic(cwd, question);
      console.log(json ? formatQueryJson(result) : formatQuery(result));
      return 0;
    }
    case 'atomize': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const force = rest.includes('--force');
      const emit = rest.includes('--emit-json');
      const apply = rest.includes('--apply');
      const undo = rest.includes('--undo');
      const positional = rest.filter(a => !a.startsWith('--'));
      if (undo) {
        const { restored, reverted } = runUndo(cwd);
        const n = restored.length + reverted.length;
        console.log(n ? `Undid latest run: ${restored.length} restored, ${reverted.length} reverted` : 'Nothing to undo.');
        return 0;
      }
      if (apply) {
        const specs = positional[0];
        if (!specs) { console.log('Usage: cortex atomize --apply <specs.json> [--write] [--force]'); return 1; }
        console.log(formatDistilledPlan(runApply(cwd, specs, { write, force })));
        return 0;
      }
      const source = positional[0];
      if (!source) { console.log('Usage: cortex atomize <source.md> [--emit-json | --write]'); return 1; }
      if (emit) { console.log(runEmit(cwd, source)); return 0; }
      console.log(formatPlan(runAtomize(cwd, source, { write })));
      return 0;
    }
    case 'promote': {
      const write = argv.includes('--write');
      console.log(formatPromote(runPromote(cwd, { write })));
      return 0;
    }
    case 'undo': {
      const { restored, reverted } = runUndo(cwd);
      const n = restored.length + reverted.length;
      console.log(n ? `Undid latest run: ${restored.length} restored, ${reverted.length} reverted` : 'Nothing to undo.');
      return 0;
    }
    case 'set-status': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const [notePath, newStatus] = rest.filter(a => !a.startsWith('--'));
      if (!notePath || !newStatus) { console.log('Usage: cortex set-status <note.md> <status> [--write]'); return 1; }
      const r = runSetStatus(cwd, notePath, newStatus, { write });
      console.log(r.changed ? `${r.changed} → status: ${newStatus}` : r.skipped ? `skipped (${r.skipped.reason})` : '(dry-run — pass --write to apply)');
      return 0;
    }
    case 'hook': {
      const event = argv[1];
      if (!event) { console.log('Usage: cortex hook <event>'); return 1; }
      const out = await runHookCommand(cwd, event);
      if (out && out !== '{}') process.stdout.write(out);
      return 0;
    }
    case 'pause': {
      runPause(cwd);
      console.log('Cortex autonomy paused. Run `cortex resume` to re-enable.');
      return 0;
    }
    case 'resume': {
      runResume(cwd);
      console.log('Cortex autonomy resumed.');
      return 0;
    }
    case 'embed': {
      const rest = argv.slice(1);
      const force = rest.includes('--force');
      const mi = rest.indexOf('--model');
      const model = mi >= 0 ? rest[mi + 1] : undefined;
      console.log(formatEmbed(await runEmbed(cwd, { force, model })));
      return 0;
    }
    case 'mcp': {
      const rest = argv.slice(1);
      const positionals = rest.filter(a => !a.startsWith('--'));
      const sub = positionals[0];
      if (rest.includes('--help') || rest.includes('-h') || sub === 'help') { console.log(MCP_HELP); return 0; }
      if (sub === 'install') return runMcpInstall(cwd, rest);
      if (sub === 'uninstall') return runMcpUninstall(cwd, rest);
      const writeScope = parseWriteScope(rest);
      if (writeScope === 'invalid') {
        console.error('Invalid --write value. Use --write (=draft), --write=draft, or --write=curate.');
        return 1;
      }
      // Bare vault path (or nothing) → start the stdio server. Only the literal
      // keywords install/uninstall/help are subcommands; anything else is a vault.
      await runMcp(sub ? resolvePath(cwd, sub) : cwd, writeScope);
      return 0;
    }
    case 'gaps': {
      console.log(formatGaps(runGaps(cwd)));
      return 0;
    }
    case 'dupes': {
      const ti = argv.indexOf('--threshold');
      const threshold = ti >= 0 ? Number(argv[ti + 1]) : undefined;
      const crossType = argv.includes('--cross-type');
      const pairs = runDupes(cwd, { threshold, crossType });
      console.log(argv.includes('--json') ? formatDupesJson(pairs) : formatDupes(pairs));
      return 0;
    }
    case 'merge': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const fi = rest.indexOf('--content-file');
      const contentFile = fi >= 0 ? rest[fi + 1] : undefined;
      const positional = rest.filter(a => !a.startsWith('--') && a !== contentFile);
      const [keep, drop] = positional;
      if (!keep || !drop || !contentFile) {
        console.log('Usage: cortex merge <keep.md> <drop.md> --content-file <merged.md> [--write]');
        return 1;
      }
      console.log(formatMerge(runMerge(cwd, keep, drop, contentFile, { write })));
      return 0;
    }
    case 'verify': {
      const rest = argv.slice(1);
      const hi = rest.indexOf('--hops');
      const hops = hi >= 0 ? Number(rest[hi + 1]) : undefined;
      if (rest.includes('--all')) {
        console.log(formatVerifyAll(runVerifyAll(cwd, { hops })));
        return 0;
      }
      const note = rest.filter(a => !a.startsWith('--') && a !== String(hops))[0];
      if (!note) { console.log('Usage: cortex verify <note.md> [--hops N]  |  cortex verify --all [--hops N]'); return 1; }
      console.log(formatVerify(runVerify(cwd, note, { hops })));
      return 0;
    }
    case 'moc': {
      const rest = argv.slice(1);
      const write = rest.includes('--write');
      const topic = rest.filter(a => !a.startsWith('--'))[0];
      if (!topic) { console.log('Usage: cortex moc <topic> [--write]'); return 1; }
      console.log(formatMoc(runMoc(cwd, topic, { write })));
      return 0;
    }
    case 'doc': {
      const rest = argv.slice(1);
      const pdf = rest.includes('--pdf');
      const topic = rest.filter(a => !a.startsWith('--'))[0];
      if (!topic) { console.log('Usage: cortex doc <topic> [--pdf]'); return 1; }
      console.log(formatDoc(runDoc(cwd, topic, { pdf })));
      return 0;
    }
    default:
      console.log(USAGE);
      return 1;
  }
}

/**
 * True when this module is the process entry point. Resolves symlinks on both
 * sides so it holds when invoked through an npm/npx `bin` symlink (where
 * `process.argv[1]` is the link and `import.meta.url` is the real file).
 */
export function isEntrypoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isEntrypoint(process.argv[1], import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code));
}
