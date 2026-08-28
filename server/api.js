import path from 'node:path';
import { loadConfig } from './config.js';
import { listComponents } from './components.js';
import {
  HttpError,
  createDoc,
  listDocs,
  readAsset,
  readDoc,
  renameDoc,
  saveAsset,
  saveDoc,
  trashDoc,
} from './docs.js';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 25 * 1024 * 1024) throw new HttpError(413, 'Upload too large (25 MB limit)');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON');
  }
}

async function route(req, res, url) {
  const segments = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const [resource, slug, action, assetName] = segments;
  const method = req.method ?? 'GET';

  if (resource === 'config' && method === 'GET') {
    const config = await loadConfig();
    return sendJson(res, 200, {
      contentRoot: config.contentRoot,
      contentRootAbs: config.contentRootAbs,
      defaultExtension: config.defaultExtension,
      frontmatterFields: config.frontmatterFields,
      componentDirs: config.componentDirs.map(({ id, label, path: p }) => ({ id, label, path: p })),
    });
  }

  if (resource === 'components' && method === 'GET') {
    return sendJson(res, 200, { groups: await listComponents() });
  }

  if (resource === 'docs') {
    if (!slug) {
      if (method === 'GET') return sendJson(res, 200, { docs: await listDocs() });
      if (method === 'POST') return sendJson(res, 201, await createDoc(await readBody(req)));
    } else if (!action) {
      if (method === 'GET') return sendJson(res, 200, await readDoc(slug));
      if (method === 'PUT') return sendJson(res, 200, await saveDoc(slug, await readBody(req)));
      if (method === 'DELETE') return sendJson(res, 200, await trashDoc(slug));
    } else if (action === 'rename' && method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 200, await renameDoc(slug, body.slug));
    } else if (action === 'assets') {
      if (!assetName && method === 'POST') return sendJson(res, 201, await saveAsset(slug, await readBody(req)));
      if (assetName && method === 'GET') {
        const file = decodeURIComponent(assetName);
        const buffer = await readAsset(slug, file);
        res.writeHead(200, {
          'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        return res.end(buffer);
      }
    }
  }

  throw new HttpError(404, `No route for ${method} ${url.pathname}`);
}

/** Node middleware handling every /api/* request. Returns false when the path is not ours. */
export async function apiMiddleware(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  try {
    await route(req, res, url);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error('[api]', err);
    if (!res.headersSent) sendJson(res, status, { error: err.message });
    else res.end();
  }
  return true;
}
