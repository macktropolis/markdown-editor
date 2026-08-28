import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { apiMiddleware } from '../server/api.js';
import { setHostConfig } from '../server/config.js';

const packageRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const editorDist = path.join(packageRoot, 'dist', 'editor');

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const DEFAULT_FRONTMATTER = [
  { key: 'title', label: 'Title', type: 'string', required: true },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'pubDate', label: 'Published', type: 'date' },
  { key: 'tags', label: 'Tags', type: 'list' },
  { key: 'draft', label: 'Draft', type: 'boolean' },
];

/**
 * A content editor mounted into `astro dev`.
 *
 * Dev only, deliberately: it writes files, and that capability must never exist in a
 * built site. The editor reads the host site's own components and content directory,
 * so the components it offers are always ones the document can actually use.
 *
 * @param {object} options
 * @param {string} options.collection      Content collection to edit, e.g. 'blog'.
 * @param {string} [options.route]         Where to mount, default '/editor'.
 * @param {string} [options.contentDir]    Override the content directory.
 * @param {string} [options.previewUrl]    Live page URL template, e.g. '/blog/{slug}'.
 * @param {Array}  [options.componentDirs] Directories to scan; defaults to src/components.
 * @param {Array}  [options.frontmatterFields] Fields the frontmatter form shows.
 * @param {string} [options.defaultExtension] 'mdx' or 'md' for new documents.
 */
export default function contentEditor(options = {}) {
  const route = (options.route ?? '/editor').replace(/\/$/, '');

  return {
    name: 'astro-content-editor',
    hooks: {
      'astro:config:setup'({ config, command, logger }) {
        if (command !== 'dev') return;

        if (!options.collection && !options.contentDir) {
          logger.warn('No `collection` or `contentDir` given — the editor will not mount.');
          return;
        }

        const srcDir = fileURLToPath(config.srcDir);
        const contentDir = options.contentDir ?? path.join('content', options.collection);

        setHostConfig({
          baseDir: srcDir,
          contentRoot: contentDir,
          defaultExtension: options.defaultExtension ?? 'mdx',
          previewUrl: options.previewUrl ?? (options.collection ? `/${options.collection}/{slug}` : null),
          frontmatterFields: options.frontmatterFields ?? DEFAULT_FRONTMATTER,
          componentDirs: options.componentDirs ?? [{ label: 'Components', path: 'components' }],
        });
      },

      'astro:server:setup'({ server, logger }) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');

          if (await apiMiddleware(req, res, `${route}/api`)) return;

          // Assets are referenced relatively, so the page must live at a trailing slash.
          if (url.pathname === route) {
            res.writeHead(302, { location: `${route}/` });
            res.end();
            return;
          }

          if (url.pathname === `${route}/`) {
            try {
              const html = await readFile(path.join(editorDist, 'index.html'), 'utf8');
              res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
              res.end(
                html.replace('<head>', `<head><script>window.__EDITOR_BASE__=${JSON.stringify(route)}</script>`),
              );
            } catch {
              res.writeHead(500, { 'content-type': 'text/plain' });
              res.end('Editor assets are missing. Run `npm run build` in astro-content-editor.');
            }
            return;
          }

          if (url.pathname.startsWith(`${route}/assets/`)) {
            const rel = url.pathname.slice(`${route}/`.length);
            const file = path.join(editorDist, rel);
            if (!file.startsWith(editorDist)) return next();
            try {
              await stat(file);
            } catch {
              return next();
            }
            res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
            createReadStream(file).pipe(res);
            return;
          }

          next();
        });

        logger.info(`Content editor ready at ${route}`);
      },
    },
  };
}
