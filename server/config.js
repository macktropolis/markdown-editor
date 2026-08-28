import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

const DEFAULTS = {
  contentRoot: './content',
  defaultExtension: 'mdx',
  componentDirs: [],
  frontmatterFields: [],
};

/** Read editor.config.json fresh on each call so edits apply without a restart. */
export async function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(await readFile(path.join(projectRoot, 'editor.config.json'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`editor.config.json is not valid JSON: ${err.message}`);
  }
  const config = { ...DEFAULTS, ...raw };
  config.contentRootAbs = path.resolve(projectRoot, config.contentRoot);
  config.componentDirs = (config.componentDirs ?? []).map((dir, i) => ({
    id: dir.id ?? `dir${i}`,
    label: dir.label ?? path.basename(dir.path),
    path: dir.path,
    pathAbs: path.resolve(projectRoot, dir.path),
  }));
  return config;
}
