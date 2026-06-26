// toolkit/src/commands/hook.ts
import { runHook } from '../hooks/dispatch.js';

function readStdin(): Promise<string> {
  return new Promise(resolve => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

export async function runHookCommand(vaultDir: string, event: string): Promise<string> {
  const stdin = await readStdin();
  return runHook(vaultDir, event, stdin);
}
