import type { ComponentGroup, Doc, DocSummary, EditorConfig } from './types';

/**
 * Where the editor is mounted. The standalone dev server serves it at the root; the
 * Astro integration mounts it under its configured route and injects this global.
 */
const BASE: string = (globalThis as { __EDITOR_BASE__?: string }).__EDITOR_BASE__ ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? `Request failed (${response.status})`);
  return payload as T;
}

export const api = {
  config: () => request<EditorConfig>('/api/config'),
  components: () => request<{ groups: ComponentGroup[] }>('/api/components').then((r) => r.groups),
  listDocs: () => request<{ docs: DocSummary[] }>('/api/docs').then((r) => r.docs),
  readDoc: (slug: string) => request<Doc>(`/api/docs/${encodeURIComponent(slug)}`),
  createDoc: (title: string, extension: string) =>
    request<Doc>('/api/docs', { method: 'POST', body: JSON.stringify({ title, extension }) }),
  saveDoc: (slug: string, raw: string, extension: string) =>
    request<Doc>(`/api/docs/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify({ raw, extension }) }),
  renameDoc: (slug: string, nextSlug: string) =>
    request<Doc>(`/api/docs/${encodeURIComponent(slug)}/rename`, { method: 'POST', body: JSON.stringify({ slug: nextSlug }) }),
  trashDoc: (slug: string) => request<{ trashedTo: string }>(`/api/docs/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  uploadAsset: (slug: string, filename: string, mimeType: string, dataBase64: string) =>
    request<{ filename: string }>(`/api/docs/${encodeURIComponent(slug)}/assets`, {
      method: 'POST',
      body: JSON.stringify({ filename, mimeType, dataBase64 }),
    }),
};

export const assetUrl = (slug: string, filename: string) =>
  `${BASE}/api/docs/${encodeURIComponent(slug)}/assets/${encodeURIComponent(filename)}`;
