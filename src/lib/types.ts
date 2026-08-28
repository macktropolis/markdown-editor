export type FrontmatterFieldType =
  | 'string'
  | 'text'
  | 'date'
  | 'list'
  | 'boolean'
  | 'number'
  | 'image'
  | 'object';

export interface FrontmatterField {
  key: string;
  label?: string;
  type: FrontmatterFieldType;
  required?: boolean;
  default?: unknown;
  /** Advisory length limit, shown as a counter. Schemas enforce the real one. */
  maxLength?: number;
  /** Sub-fields for `object`; inferred from the value's keys when omitted. */
  fields?: FrontmatterField[];
}

export interface EditorConfig {
  contentRoot: string;
  contentRootAbs: string;
  defaultExtension: 'mdx' | 'md';
  frontmatterFields: FrontmatterField[];
  /** URL template for the live rendered page, e.g. "/blog/{slug}". Null when unset. */
  previewUrl: string | null;
  componentDirs: { id: string; label: string; path: string }[];
}

export interface DocSummary {
  slug: string;
  extension: string;
  title: string;
  description: string;
  draft: boolean;
  updatedAt: string;
}

export interface Doc {
  slug: string;
  extension: string;
  raw: string;
  updatedAt: string;
  /** Path of the file within the content root, e.g. 'my-post.mdx' or 'my-post/index.mdx'. */
  relativePath: string;
  /** Prefix images need inside this document, e.g. './' or './my-post/'. */
  assetPrefix: string;
  assets: string[];
}

export interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  doc?: string;
  default?: string;
}

export interface ComponentInfo {
  name: string;
  relativePath: string;
  source: string;
  description?: string;
  props: ComponentProp[];
}

export interface SnippetResult {
  snippet: string;
  imports: string[];
}

export interface ComponentGroup {
  id: string;
  label: string;
  path: string;
  pathAbs: string;
  exists: boolean;
  problem?: string;
  found: number;
  components: ComponentInfo[];
}
