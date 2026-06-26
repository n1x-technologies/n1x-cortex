import { fileURLToPath } from 'node:url';
import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';
import { runOrphans } from './commands/orphans.js';
import { runViz, openBrowser } from './commands/viz.js';
import { runQuery, formatQuery } from './commands/query.js';

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
      const out = runOrphans(cwd);
      console.log(`Gaps (dangling targets, atomize-next priority): ${out.length}`);
      for (const { target, refs } of out.slice(0, 30)) console.log(`  ${String(refs).padStart(3)}  ${target}`);
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
    default:
      console.log('Usage: cortex <init|status|orphans|viz|query>');
      return cmd ? 1 : 0;
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).then(code => process.exit(code));
}
