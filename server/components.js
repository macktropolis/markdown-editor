import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';

const SCANNED_EXTENSIONS = new Set(['.astro', '.tsx', '.jsx']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.astro']);

/** The frontmatter fence of an .astro file; other file types are parsed whole. */
function scriptRegion(source, ext) {
  if (ext !== '.astro') return source;
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  return match ? match[1] : '';
}

/**
 * Blank out comment bodies and string contents, preserving every offset and newline.
 * Declarations are located against this so that prose mentioning `interface Props`,
 * or a brace inside a string, is not mistaken for code.
 */
function maskNonCode(source) {
  const out = source.split('');
  const blank = (start, end) => {
    for (let k = start; k < end && k < out.length; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };

  let i = 0;
  while (i < source.length) {
    const pair = source.slice(i, i + 2);

    if (pair === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (pair === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    const quote = source[i];
    if (quote === '"' || quote === "'" || quote === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== quote) {
        if (source[j] === '\\') j += 1;
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }

    i += 1;
  }

  return out.join('');
}

/**
 * Return the text inside the braces that follow `startIndex`, respecting nesting.
 * Nesting is counted against `masked` so braces in comments and strings do not
 * unbalance the block, while the text returned comes from the real source.
 */
function balancedBlock(source, masked, startIndex) {
  const open = masked.indexOf('{', startIndex);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

/** Split on top-level separators only, so `Record<string, string>` stays intact. */
function splitMembers(block) {
  const members = [];
  let depth = 0;
  let current = '';
  for (const char of block) {
    if ('{[(<'.includes(char)) depth += 1;
    else if ('}])>'.includes(char)) depth -= 1;
    if (depth === 0 && (char === ';' || char === '\n')) {
      members.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  members.push(current);
  return members.map((m) => m.trim()).filter(Boolean);
}

/**
 * Pull prop descriptions out of block comments, matching lines like
 * `  side — 'left' | 'right' (default 'left')` against the props we already parsed.
 * Components often document props in a JSDoc header rather than inline, and that
 * header may sit above the imports rather than directly above the interface, so
 * every block comment in the script is considered.
 */
function parseDocComments(script, propNames) {
  const docs = {};
  let description;

  const blocks = script.match(/\/\*[\s\S]*?\*\//g) ?? [];
  for (const block of blocks) {
    const lines = block
      .replace(/^\/\*+/, '')
      .replace(/\*+\/$/, '')
      .split('\n')
      // Drop the leading star but keep the indentation after it, which is what
      // distinguishes a new prop entry from a wrapped continuation line.
      .map((line) => line.replace(/^\s*\*/, ''));

    let current = null;
    for (const line of lines) {
      if (!line.trim()) {
        current = null;
        continue;
      }

      const entry = /^\s{0,6}([A-Za-z_$][\w$]*)\s*[—–:-]\s+(.*)$/.exec(line);
      if (entry && propNames.has(entry[1])) {
        current = entry[1];
        docs[current] = entry[2].trim();
        continue;
      }

      if (current && /^\s{7,}/.test(line)) {
        docs[current] = `${docs[current]} ${line.trim()}`.replace(/\s+/g, ' ');
        continue;
      }

      current = null;
      // The first prose line of the first block doubles as the component summary.
      // Section headers ("Props:", "Usage in .mdx:") are not summaries.
      if (description === undefined && !/^\s*[\w .]+:\s*$/.test(line)) {
        description = line.trim().replace(/^[A-Za-z_$][\w$]*\s*[—–]\s*/, '');
      }
    }
  }

  return { docs, description };
}

function parseProps(script, masked) {
  const declaration = /(?:export\s+)?(?:interface\s+Props\b|type\s+Props\s*=)/.exec(masked);
  if (!declaration) return [];
  const block = balancedBlock(script, masked, declaration.index);
  if (!block) return [];

  const props = [];
  let pendingDoc = '';

  for (const member of splitMembers(block)) {
    if (member.startsWith('//')) {
      pendingDoc = member.replace(/^\/\/\s?/, '');
      continue;
    }
    if (member.startsWith('/*') || member.startsWith('*')) {
      pendingDoc = member.replace(/^\/\*+|\*+\/$|^\*\s?/g, '').trim() || pendingDoc;
      continue;
    }
    const match = /^([A-Za-z_$][\w$]*)\s*(\?)?\s*:\s*([\s\S]+)$/.exec(member);
    if (!match) continue;
    const [, name, optional, rawType] = match;
    props.push({
      name,
      type: rawType.replace(/\s+/g, ' ').trim(),
      required: !optional,
      doc: pendingDoc || undefined,
    });
    pendingDoc = '';
  }
  return props;
}

/** Pull defaults out of `const { a = 1, b } = Astro.props;`. */
function parseDefaults(script, masked) {
  const pattern = /const\s*\{([\s\S]*?)\}\s*=\s*(?:Astro\.props|props)\b/;
  // Located against the masked copy, then re-read from the real source at the same
  // offsets, so string defaults like `side = 'left'` survive intact.
  const located = pattern.exec(masked);
  if (!located) return {};
  const match = pattern.exec(script.slice(located.index, located.index + located[0].length));
  if (!match) return {};
  const defaults = {};
  for (const part of splitMembers(match[1].replace(/,/g, '\n'))) {
    const eq = /^([A-Za-z_$][\w$]*)\s*=\s*(.+)$/.exec(part.trim());
    if (eq) defaults[eq[1]] = eq[2].trim();
  }
  return defaults;
}

async function walk(dirAbs, baseAbs, out) {
  let entries;
  try {
    entries = await readdir(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) await walk(abs, baseAbs, out);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!SCANNED_EXTENSIONS.has(ext)) continue;
    out.push({ abs, relative: path.relative(baseAbs, abs), ext });
  }
}

export async function listComponents() {
  const config = await loadConfig();
  const groups = [];

  for (const dir of config.componentDirs) {
    // A configured directory that does not exist is reported rather than silently
    // yielding zero components — the usual cause is a checkout on another machine
    // where this relative path points nowhere.
    let exists = true;
    let problem;
    try {
      if (!(await stat(dir.pathAbs)).isDirectory()) {
        exists = false;
        problem = 'Not a directory';
      }
    } catch (err) {
      exists = false;
      problem = err.code === 'ENOENT' ? 'Directory not found' : err.message;
    }

    if (!exists) {
      groups.push({ id: dir.id, label: dir.label, path: dir.path, pathAbs: dir.pathAbs, exists, problem, found: 0, components: [] });
      continue;
    }

    const files = [];
    await walk(dir.pathAbs, dir.pathAbs, files);
    files.sort((a, b) => a.relative.localeCompare(b.relative));

    const components = [];
    for (const file of files) {
      let source;
      try {
        source = await readFile(file.abs, 'utf8');
      } catch {
        continue;
      }
      const script = scriptRegion(source, file.ext);
      const masked = maskNonCode(script);
      const defaults = parseDefaults(script, masked);
      const parsed = parseProps(script, masked);
      const { docs, description } = parseDocComments(script, new Set(parsed.map((prop) => prop.name)));
      const props = parsed.map((prop) => ({
        ...prop,
        default: defaults[prop.name],
        doc: prop.doc ?? docs[prop.name],
      }));
      components.push({
        name: path.basename(file.relative, file.ext),
        relativePath: file.relative,
        source: dir.label,
        description,
        props,
      });
    }

    groups.push({
      id: dir.id,
      label: dir.label,
      path: dir.path,
      pathAbs: dir.pathAbs,
      exists: true,
      found: components.length,
      components,
    });
  }

  return groups;
}
