// Serves fixtures/charts/mock-chart/ on http://127.0.0.1:5199 so the extension has a safe,
// synthetic chart page to capture. Binds to loopback only. No dependencies.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 5199);
const ROOT = resolve(fileURLToPath(new URL('../../../fixtures/charts/mock-chart/', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', `http://${HOST}`).pathname);
    const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^([/\\])+/, '');
    const file = resolve(join(ROOT, relative));
    // Never serve anything outside the fixture folder (blocks ../ traversal).
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') throw error;
  console.error(`Port ${PORT} is already in use: the mock chart is probably already running at http://${HOST}:${PORT}/`);
  console.error(`Open that address, or stop the other server (or run with a different PORT, e.g. PORT=5200).`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Mock chart (synthetic data) running at http://${HOST}:${PORT}/`);
  console.log('Press Ctrl+C to stop.');
});
