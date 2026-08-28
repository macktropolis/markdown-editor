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

async function docFileFor(dirAbs) {
  for (const ext of DOC_EXTENSIONS) {
    const file = path.join(dirAbs, `index.${ext}`);
    try {
      await stat(file);
      return { file, extension: ext };
    } catch {
      /* try next extension */
    }
  }
  return null;
}

async function ensureContentRoot() {
  const config = await loadConfig();
  await mkdir(config.contentRootAbs, { recursive: true });
  return config;
}

export async function listDocs() {
  const config = await ensureContentRoot();
  const entries = await readdir(config.contentRootAbs, { withFileTypes: true });
  const docs = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dirAbs = path.join(config.contentRootAbs, entry.name);
    const found = await docFileFor(dirAbs);
    if (!found) continue;
    const [raw, stats] = await Promise.all([readFile(found.file, 'utf8'), stat(found.file)]);
    const data = parseFrontmatter(raw);
    docs.push({
      slug: entry.name,
      extension: found.extension,
      title: typeof data.title === 'string' && data.title.trim() ? data.title : entry.name,
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
  const dirAbs = path.join(config.contentRootAbs, slug);
  const found = await docFileFor(dirAbs);
  if (!found) throw new HttpError(404, `No document named "${slug}"`);
  const [raw, stats, files] = await Promise.all([
    readFile(found.file, 'utf8'),
    stat(found.file),
    readdir(dirAbs).catch(() => []),
  ]);
  return {
    slug,
    extension: found.extension,
    raw,
    updatedAt: stats.mtime.toISOString(),
    assets: files.filter((name) => !name.startsWith('index.') && !name.startsWith('.')),
  };
}

export async function createDoc({ title, slug, extension }) {
  const config = await ensureContentRoot();
  const ext = DOC_EXTENSIONS.includes(extension) ? extension : config.defaultExtension;
  const base = slug ? assertSlug(slug) : slugify(title);

  let name = base;
  for (let i = 2; ; i += 1) {
    try {
      await stat(path.join(config.contentRootAbs, name));
      name = `${base}-${i}`;
    } catch {
      break;
    }
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

  const dirAbs = path.join(config.contentRootAbs, name);
  await mkdir(dirAbs, { recursive: true });
  await writeFile(path.join(dirAbs, `index.${ext}`), frontmatter, 'utf8');
  return readDoc(name);
}

export async function saveDoc(slug, { raw, extension }) {
  assertSlug(slug);
  if (typeof raw !== 'string') throw new HttpError(400, 'Missing document body');
  const config = await ensureContentRoot();
  const dirAbs = path.join(config.contentRootAbs, slug);
  await mkdir(dirAbs, { recursive: true });

  const existing = await docFileFor(dirAbs);
  const ext = DOC_EXTENSIONS.includes(extension) ? extension : existing?.extension ?? config.defaultExtension;
  const target = path.join(dirAbs, `index.${ext}`);

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
  const toAbs = path.join(config.contentRootAbs, target);
  try {
    await stat(toAbs);
    throw new HttpError(409, `A document named "${target}" already exists`);
  } catch (err) {
    if (err instanceof HttpError) throw err;
  }
  await rename(path.join(config.contentRootAbs, slug), toAbs);
  return readDoc(target);
}

/** Moves the document folder into content/.trash/ rather than deleting it outright. */
export async function trashDoc(slug) {
  assertSlug(slug);
  const config = await ensureContentRoot();
  const trashAbs = path.join(config.contentRootAbs, TRASH_DIR);
  await mkdir(trashAbs, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await rename(path.join(config.contentRootAbs, slug), path.join(trashAbs, `${slug}--${stamp}`));
  return { slug, trashedTo: path.join(TRASH_DIR, `${slug}--${stamp}`) };
}

const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

export async function saveAsset(slug, { filename, mimeType, dataBase64 }) {
  assertSlug(slug);
  if (typeof dataBase64 !== 'string' || !dataBase64) throw new HttpError(400, 'Missing image data');
  const config = await ensureContentRoot();
  const dirAbs = path.join(config.contentRootAbs, slug);
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
  return readFile(path.join(config.contentRootAbs, slug, filename));
}
