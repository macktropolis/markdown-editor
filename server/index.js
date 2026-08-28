import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { apiMiddleware } from './api.js';
import { projectRoot } from './config.js';

const PORT = Number(process.env.PORT ?? 4321);
const distDir = path.join(projectRoot, 'dist', 'editor');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

async function resolveStatic(pathname) {
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidate = path.join(distDir, rel);
  if (!candidate.startsWith(distDir)) return path.join(distDir, 'index.html');
  try {
    const stats = await stat(candidate);
    if (stats.isFile()) return candidate;
  } catch {
    /* fall through to the SPA entry point */
  }
  return path.join(distDir, 'index.html');
}

const server = createServer(async (req, res) => {
  if (await apiMiddleware(req, res)) return;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = await resolveStatic(url.pathname);
  try {
    await stat(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Run `npm run build` first.');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Markdown editor  →  http://localhost:${PORT}\n`);
});
