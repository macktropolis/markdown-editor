import { readdir, readFile, writeFile, mkdir, rename, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { loadConfig } from './config.js';

const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/;
const DOC_EXTENSIONS = ['mdx', 'md'];
const TRASH_DIR = '.trash';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function assertSlug(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.includes('..')) {
    throw new HttpError(400, `Invalid document name: ${JSON.stringify(slug)}`);
  }
  return slug;
}

export function slugify(input) {
  const slug = String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return slug || 'untitled';
}

/** Split an mdx/md file into its YAML frontmatter block and body. */
export function splitFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { frontmatterText: '', body: raw };
  return { frontmatterText: match[1], body: raw.slice(match[0].length) };
}

function parseFrontmatter(raw) {
  const { frontmatterText } = splitFrontmatter(raw);
  if (!frontmatterText.trim()) return {};
  try {
    return YAML.parse(frontmatterText) ?? {};
  } catch {
    return {};
  }
}

/**
 * Two directory shapes are supported.
 *
 *  folder — `<root>/<slug>/index.mdx`, images alongside. Keeps assets with the post.
 *  flat   — `<root>/<slug>.mdx`, the convention Astro's glob loader expects. Images
 *           still live in `<root>/<slug>/`, which the `**\/*.{md,mdx}` pattern ignores.
 *
 * Both put assets in the same place, so only the document path differs.
 */
function docFileCandidates(config, slug) {
  return DOC_EXTENSIONS.map((ext) => ({
    ext,
    file:
      config.layout === 'flat'
        ? path.join(config.contentRootAbs, `${slug}.${ext}`)
        : path.join(config.contentRootAbs, slug, `index.${ext}`),
  }));
}

function assetDirFor(config, slug) {
  return path.join(config.contentRootAbs, slug);
}

async function docFileFor(config, slug) {
  for (const candidate of docFileCandidates(config, slug)) {
    try {
      await stat(candidate.file);
      return { file: candidate.file, extension: candidate.ext };
    } catch {
      /* try next extension */
    }
  }
  return null;
}

/** Pick the shape from what is already on disk, falling back to the configured default. */
async function detectLayout(rootAbs, fallback) {
  let entries;
  try {
    entries = await readdir(rootAbs, { withFileTypes: true });
  } catch {
    return fallback;
  }

  const flatDocs = entries.some(
    (entry) => entry.isFile() && DOC_EXTENSIONS.some((ext) => entry.name.endsWith(`.${ext}`)),
  );
  if (flatDocs) return 'flat';

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    for (const ext of DOC_EXTENSIONS) {
      try {
        await stat(path.join(rootAbs, entry.name, `index.${ext}`));
        return 'folder';
      } catch {
        /* keep looking */
      }
    }
  }

  return fallback;
}

async function ensureContentRoot() {
  const config = await loadConfig();
  await mkdir(config.contentRootAbs, { recursive: true });
  if (config.layout !== 'flat' && config.layout !== 'folder') {
    config.layout = await detectLayout(config.contentRootAbs, config.layoutFallback ?? 'folder');
  }
  return config;
}

export async function listDocs() {
  const config = await ensureContentRoot();
  const entries = await readdir(config.contentRootAbs, { withFileTypes: true });
  const docs = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    let slug;
    if (config.layout === 'flat') {
      if (!entry.isFile()) continue;
      const ext = DOC_EXTENSIONS.find((candidate) => entry.name.endsWith(`.${candidate}`));
      if (!ext) continue;
      slug = entry.name.slice(0, -(ext.length + 1));
    } else {
      if (!entry.isDirectory()) continue;
      slug = entry.name;
    }

    const found = await docFileFor(config, slug);
    if (!found) continue;
    const [raw, stats] = await Promise.all([readFile(found.file, 'utf8'), stat(found.file)]);
    const data = parseFrontmatter(raw);
    docs.push({
      slug,
      extension: found.extension,
      title: typeof data.title === 'string' && data.title.trim() ? data.title : slug,
      description: typeof data.description === 'string' ? data.description : '',
      draft: data.draft === true,
      updatedAt: stats.mtime.toISOString(),
    });
  }

  docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return docs;
}

export async function readDoc(slug) {
  assertSlug(slug);
  const config = await ensureContentRoot();
  const found = await docFileFor(config, slug);
  if (!found) throw new HttpError(404, `No document named "${slug}"`);
  const [raw, stats, files] = await Promise.all([
    readFile(found.file, 'utf8'),
    stat(found.file),
    readdir(assetDirFor(config, slug)).catch(() => []),
  ]);
  return {
    slug,
    extension: found.extension,
    raw,
    updatedAt: stats.mtime.toISOString(),
    relativePath: path.relative(config.contentRootAbs, found.file),
    // How images must be referenced from inside this document, which differs by layout:
    // a folder document sits with its images, a flat one sits beside their directory.
    assetPrefix: config.layout === 'flat' ? `./${slug}/` : './',
    assets: files.filter((name) => !name.startsWith('index.') && !name.startsWith('.')),
  };
}

export async function createDoc({ title, slug, extension }) {
  const config = await ensureContentRoot();
  const ext = DOC_EXTENSIONS.includes(extension) ? extension : config.defaultExtension;
  const base = slug ? assertSlug(slug) : slugify(title);

  let name = base;
  for (let i = 2; ; i += 1) {
    if (!(await docFileFor(config, name)) && !(await exists(path.join(config.contentRootAbs, name)))) break;
    name = `${base}-${i}`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title || 'Untitled')}`,
    'description: ""',
    `publishedAt: ${today}`,
    'draft: true',
    '---',
    '',
    '',
  ].join('\n');

  const target = docFileCandidates({ ...config, layout: config.layout }, name).find((c) => c.ext === ext).file;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, frontmatter, 'utf8');
  return readDoc(name);
}

export async function saveDoc(slug, { raw, extension }) {
  assertSlug(slug);
  if (typeof raw !== 'string') throw new HttpError(400, 'Missing document body');
  const config = await ensureContentRoot();

  const existing = await docFileFor(config, slug);
  const ext = DOC_EXTENSIONS.includes(extension) ? extension : existing?.extension ?? config.defaultExtension;
  const target = docFileCandidates(config, slug).find((c) => c.ext === ext).file;

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, raw, 'utf8');
  // Changing the extension leaves the old file behind; remove it so the doc stays single-file.
  if (existing && existing.file !== target) await rm(existing.file, { force: true });
  return readDoc(slug);
}

export async function renameDoc(slug, nextSlug) {
  assertSlug(slug);
  const target = assertSlug(slugify(nextSlug));
  if (slug === target) return readDoc(slug);
  const config = await ensureContentRoot();
  if (await docFileFor(config, target)) {
    throw new HttpError(409, `A document named "${target}" already exists`);
  }

  const found = await docFileFor(config, slug);
  if (!found) throw new HttpError(404, `No document named "${slug}"`);

  if (config.layout === 'flat') {
    await rename(found.file, path.join(config.contentRootAbs, `${target}.${found.extension}`));
    // Images live in a sibling folder named for the slug; move it too when present.
    if (await exists(assetDirFor(config, slug))) {
      await rename(assetDirFor(config, slug), assetDirFor(config, target));
    }
  } else {
    await rename(path.join(config.contentRootAbs, slug), path.join(config.contentRootAbs, target));
  }

  return readDoc(target);
}

/** Moves the document folder into content/.trash/ rather than deleting it outright. */
export async function trashDoc(slug) {
  assertSlug(slug);
  const config = await ensureContentRoot();
  const trashAbs = path.join(config.contentRootAbs, TRASH_DIR);
  await mkdir(trashAbs, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(trashAbs, `${slug}--${stamp}`);
  await mkdir(destination, { recursive: true });

  const found = await docFileFor(config, slug);
  if (!found) throw new HttpError(404, `No document named "${slug}"`);

  if (config.layout === 'flat') {
    await rename(found.file, path.join(destination, path.basename(found.file)));
    if (await exists(assetDirFor(config, slug))) {
      await rename(assetDirFor(config, slug), path.join(destination, slug));
    }
  } else {
    await rm(destination, { recursive: true, force: true });
    await rename(path.join(config.contentRootAbs, slug), destination);
  }

  return { slug, trashedTo: path.join(TRASH_DIR, `${slug}--${stamp}`) };
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

export async function saveAsset(slug, { filename, mimeType, dataBase64 }) {
  assertSlug(slug);
  if (typeof dataBase64 !== 'string' || !dataBase64) throw new HttpError(400, 'Missing image data');
  const config = await ensureContentRoot();
  const dirAbs = assetDirFor(config, slug);
  await mkdir(dirAbs, { recursive: true });

  const parsed = path.parse(filename || 'image');
  const ext = (parsed.ext || `.${IMAGE_EXT[mimeType] ?? 'png'}`).toLowerCase();
  const base = slugify(parsed.name) || 'image';

  let name = `${base}${ext}`;
  for (let i = 2; ; i += 1) {
    try {
      await stat(path.join(dirAbs, name));
      name = `${base}-${i}${ext}`;
    } catch {
      break;
    }
  }

  await writeFile(path.join(dirAbs, name), Buffer.from(dataBase64, 'base64'));
  return { filename: name };
}

export async function readAsset(slug, filename) {
  assertSlug(slug);
  if (path.basename(filename) !== filename) throw new HttpError(400, 'Invalid asset name');
  const config = await ensureContentRoot();
  return readFile(path.join(assetDirFor(config, slug), filename));
}
