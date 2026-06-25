import { createServer as createHttpServer } from 'node:http';
import type { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraphData } from './graphData.js';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';

const STATIC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'static');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function createServer(vaultDir: string): Server {
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/health') {
        res.writeHead(200, { 'content-type': MIME['.json'] });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (url.pathname === '/api/graph') {
        const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
        const data = buildGraphData(vaultDir, config);
        res.writeHead(200, { 'content-type': MIME['.json'] });
        res.end(JSON.stringify(data));
        return;
      }
      const rel = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = normalize(join(STATIC_DIR, rel));
      if (filePath !== STATIC_DIR && !filePath.startsWith(STATIC_DIR + '/')) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
}

export function startViz(vaultDir: string, port = 4317): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(vaultDir);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const p = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ server, port: p, url: `http://localhost:${p}/` });
    });
  });
}
