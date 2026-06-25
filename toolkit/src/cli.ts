import { runInit } from './commands/init.js';
import { runStatus } from './commands/status.js';

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
    default:
      console.log('Usage: cortex <init|status|orphans>');
      return cmd ? 1 : 0;
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).then(code => process.exit(code));
}
