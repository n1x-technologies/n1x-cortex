import { spawn } from 'node:child_process';
import type { Server } from 'node:http';
import { startViz } from '../viz/server.js';

export function runViz(vaultDir: string, port = 4317): Promise<{ server: Server; port: number; url: string }> {
  return startViz(vaultDir, port);
}

/**
 * Resolve the viewer port: an explicit `--port N` wins, then the vault's
 * `viz.port` config, then the 4317 default. Returns 'invalid' when `--port` is
 * present but not an integer in 1–65535 (so the CLI can fail loudly instead of
 * silently binding the wrong port).
 */
export function resolveVizPort(args: string[], configPort?: number): number | 'invalid' {
  const i = args.indexOf('--port');
  if (i >= 0) {
    const n = Number(args[i + 1]);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return 'invalid';
    return n;
  }
  return configPort ?? 4317;
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
