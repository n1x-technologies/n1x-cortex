import { fileURLToPath } from 'node:url';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runOrphans } from './commands/orphans.js';
import { runViz, openBrowser } from './commands/viz.js';
import { runQuery, formatQuery } from './commands/query.js';
import { runAtomize, formatPlan, runEmit, runApply, formatDistilledPlan, runUndo } from './commands/atomize.js';

export async function main(argv: string[]): Promise<number> {
  const [cmd] = argv;
  const cwd = process.cwd();
  switch (cmd) {
    case 'init': {
      const { created, config } = runInit(cwd);
      console.log(created
        ? `Created .cortex.json (type=${config.fields.type}, status=${config.fields.status})`
        : '.cortex.json already exists — left unchanged');
      return 0;
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
      const question = argv.slice(1).join(' ').trim();
      if (!question) { console.log('Usage: cortex query <question>'); return 1; }
      console.log(formatQuery(runQuery(cwd, question)));
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
        const { restored } = runUndo(cwd);
        console.log(restored.length ? `Restored ${restored.length} note(s):\n  ${restored.join('\n  ')}` : 'No backups to restore.');
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
    default:
      console.log('Usage: cortex <init|status|orphans|viz|query|atomize>');
      return cmd ? 1 : 0;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).then(code => process.exit(code));
}
