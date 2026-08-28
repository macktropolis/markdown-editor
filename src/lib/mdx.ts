import YAML from 'yaml';
import type { ComponentInfo, SnippetResult } from './types';

export interface ParsedDocument {
  frontmatterText: string;
  body: string;
}

export function splitDocument(raw: string): ParsedDocument {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { frontmatterText: '', body: raw };
  return { frontmatterText: match[1], body: raw.slice(match[0].length) };
}

export function joinDocument(frontmatterText: string, body: string): string {
  const trimmed = frontmatterText.trim();
  if (!trimmed) return body;
  return `---\n${trimmed}\n---\n\n${body.replace(/^\n+/, '')}`;
}

export function parseFrontmatter(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const value = YAML.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function stringifyFrontmatter(data: Record<string, unknown>): string {
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && !value.length)),
  );
  if (!Object.keys(clean).length) return '';
  return YAML.stringify(clean, { lineWidth: 0 }).trimEnd();
}

export function isValidYaml(text: string): boolean {
  if (!text.trim()) return true;
  try {
    YAML.parse(text);
    return true;
  } catch {
    return false;
  }
}

export type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'meta'; text: string }
  | { kind: 'component'; name: string; text: string; attributes: [string, string][] };

const COMPONENT_OPEN = /^<([A-Z][\w.]*)/;

function parseAttributes(openingTag: string): [string, string][] {
  const attributes: [string, string][] = [];
  const pattern = /([A-Za-z_$][\w$:-]*)(?:\s*=\s*(\{[\s\S]*?\}|"[^"]*"|'[^']*'))?/g;
  const inner = openingTag.replace(COMPONENT_OPEN, '').replace(/\/?>$/, '');
  for (const match of inner.matchAll(pattern)) {
    const raw = match[2];
    attributes.push([match[1], raw ? raw.replace(/^["']|["']$/g, '') : 'true']);
  }
  return attributes;
}

/**
 * Split an MDX body into markdown, import/export, and JSX component segments.
 * Only block-level tags starting at column 0 are treated as components — inline
 * JSX inside a paragraph stays part of the markdown it appears in.
 */
export function parseSegments(body: string): Segment[] {
  const lines = body.split('\n');
  const segments: Segment[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    if (buffer.join('').trim()) segments.push({ kind: 'markdown', text: buffer.join('\n') });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) {
      buffer.push(line);
      continue;
    }

    if (/^(import|export)\s/.test(line)) {
      flush();
      const start = i;
      while (i < lines.length && lines[i].trim() !== '') i += 1;
      segments.push({ kind: 'meta', text: lines.slice(start, i).join('\n') });
      continue;
    }

    const open = COMPONENT_OPEN.exec(line);
    if (open) {
      flush();
      const name = open[1];
      const start = i;
      let text = line;

      if (!/\/>\s*$/.test(line) && !text.includes(`</${name}>`)) {
        const closing = `</${name}>`;
        while (i + 1 < lines.length && !lines[i].includes(closing) && !/\/>\s*$/.test(lines[i])) {
          i += 1;
          text += `\n${lines[i]}`;
        }
      }

      const openingTag = /^<[\s\S]*?\/?>/.exec(lines.slice(start, i + 1).join(' '))?.[0] ?? line;
      segments.push({ kind: 'component', name, text, attributes: parseAttributes(openingTag) });
      continue;
    }

    buffer.push(line);
  }

  flush();
  return segments;
}

/** Props typed as an Astro image need an `import` binding, not a string literal. */
export function isImageProp(prop: { type: string }): boolean {
  return /\bImageMetadata\b/.test(prop.type);
}

/** Identifiers already bound by import statements in the body. */
export function collectIdentifiers(body: string): Set<string> {
  const taken = new Set<string>();
  for (const match of body.matchAll(/^import\s+([A-Za-z_$][\w$]*)/gm)) taken.add(match[1]);
  return taken;
}

/** The identifier a document already binds to an import path, if any. */
export function existingImportIdentifier(body: string, importPath: string): string | null {
  for (const match of body.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/gm)) {
    if (match[2] === importPath) return match[1];
  }
  return null;
}

/** Turn a filename into a valid, unused JS identifier. */
export function imageIdentifier(filename: string, taken: Set<string> = new Set()): string {
  const words = filename
    .replace(/\.[^.]+$/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let base =
    words
      .map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1)))
      .join('') || 'image';
  if (/^\d/.test(base)) base = `img${base[0].toUpperCase()}${base.slice(1)}`;

  let name = base;
  for (let i = 2; taken.has(name); i += 1) name = `${base}${i}`;
  return name;
}

/**
 * Build an MDX snippet for a scanned component, filling required props with
 * placeholders. When the component takes an image and one is supplied, the
 * matching `import` statement is returned alongside the snippet.
 */
export function componentSnippet(
  component: ComponentInfo,
  image?: { prop: string; identifier: string; path: string },
): SnippetResult {
  const placeholder = (prop: { name: string; type: string }) => {
    if (image && prop.name === image.prop) return `{${image.identifier}}`;
    const normalized = prop.type.replace(/\s/g, '');
    if (/^('|")/.test(normalized)) return `"${normalized.split('|')[0].replace(/['"]/g, '')}"`;
    if (normalized.startsWith('string')) return '""';
    if (normalized.startsWith('number')) return '{0}';
    if (normalized.startsWith('boolean')) return '{true}';
    if (normalized.includes('[]') || normalized.startsWith('Array')) return '{[]}';
    return '{}';
  };

  const imports = image ? [`import ${image.identifier} from '${image.path}';`] : [];
  const props = component.props.filter((prop) => prop.required);

  if (!props.length) return { snippet: `<${component.name} />`, imports };
  if (props.length === 1) return { snippet: `<${component.name} ${props[0].name}=${placeholder(props[0])} />`, imports };

  const lines = props.map((prop) => `  ${prop.name}=${placeholder(prop)}`);
  return { snippet: `<${component.name}\n${lines.join('\n')}\n/>`, imports };
}
