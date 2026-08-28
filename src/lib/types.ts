export type FrontmatterFieldType = 'string' | 'text' | 'date' | 'list' | 'boolean' | 'number' | 'image';

export interface FrontmatterField {
  key: string;
  label?: string;
  type: FrontmatterFieldType;
  required?: boolean;
  default?: unknown;
}

export interface EditorConfig {
  contentRoot: string;
  contentRootAbs: string;
  defaultExtension: 'mdx' | 'md';
  frontmatterFields: FrontmatterField[];
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
  found: number;
  components: ComponentInfo[];
}
