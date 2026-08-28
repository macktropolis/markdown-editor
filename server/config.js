import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

const CONFIG_FILE = 'editor.config.json';
const LOCAL_CONFIG_FILE = 'editor.config.local.json';

const DEFAULTS = {
  contentRoot: './content',
  defaultExtension: 'mdx',
  componentDirs: [],
  frontmatterFields: [],
};

/**
 * Config supplied by a host rather than read from disk. The Astro integration sets
 * this from the site's own paths, so an installed editor needs no config file.
 */
let hostConfig = null;

export function setHostConfig(config) {
  hostConfig = config;
}

async function readJson(filename) {
  try {
    return JSON.parse(await readFile(path.join(projectRoot, filename), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`${filename} is not valid JSON: ${err.message}`);
  }
}

/**
 * Read config fresh on each call so edits apply without a restart.
 *
 * `editor.config.local.json` is git-ignored and its top-level keys win, which is how
 * a checkout on another machine points `componentDirs` somewhere that exists there
 * without touching the shared config.
 */
export async function loadConfig() {
  let config;
  let base;

  if (hostConfig) {
    config = { ...DEFAULTS, ...hostConfig };
    base = hostConfig.baseDir ?? projectRoot;
  } else {
    const shared = (await readJson(CONFIG_FILE)) ?? {};
    const local = (await readJson(LOCAL_CONFIG_FILE)) ?? {};
    config = { ...DEFAULTS, ...shared, ...local };
    config.hasLocalOverrides = Object.keys(local).length > 0;
    base = projectRoot;
  }

  config.contentRootAbs = path.resolve(base, config.contentRoot);
  config.componentDirs = (config.componentDirs ?? []).map((dir, i) => ({
    id: dir.id ?? `dir${i}`,
    label: dir.label ?? path.basename(dir.path),
    path: dir.path,
    pathAbs: path.resolve(base, dir.path),
  }));
  return config;
}
