import { spawn } from 'node:child_process';
import type { Server } from 'node:http';
import { startViz } from '../viz/server.js';

export function runViz(vaultDir: string, port = 4317): Promise<{ server: Server; port: number; url: string }> {
  return startViz(vaultDir, port);
}

export function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* best-effort: opening the browser is a convenience, not a requirement */
  }
}
