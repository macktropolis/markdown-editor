import { useMemo, useState } from 'react';
import type { DocSummary } from '../lib/types';

interface Props {
  docs: DocSummary[];
  activeSlug: string | null;
  contentRoot: string;
  onSelect: (slug: string) => void;
  onCreate: () => void;
  onRename: (slug: string) => void;
  onDelete: (slug: string) => void;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function Sidebar({ docs, activeSlug, contentRoot, onSelect, onCreate, onRename, onDelete }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return docs;
    return docs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(needle) ||
        doc.slug.toLowerCase().includes(needle) ||
        doc.description.toLowerCase().includes(needle),
    );
  }, [docs, query]);

  return (
    <aside className="sidebar">
      <header className="sidebar-head">
        <h1>Documents</h1>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          New
        </button>
      </header>

      <input className="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <ul className="doc-list">
        {filtered.map((doc) => (
          <li key={doc.slug} className={doc.slug === activeSlug ? 'is-active' : ''}>
            <button type="button" className="doc-item" onClick={() => onSelect(doc.slug)}>
              <span className="doc-title">
                {doc.title}
                {doc.draft && <span className="badge">draft</span>}
              </span>
              <span className="doc-meta">
                {doc.slug}.{doc.extension} · {relativeTime(doc.updatedAt)}
              </span>
            </button>
            <div className="doc-actions">
              <button type="button" title="Rename" onClick={() => onRename(doc.slug)}>
                ✎
              </button>
              <button type="button" title="Move to trash" onClick={() => onDelete(doc.slug)}>
                ⌫
              </button>
            </div>
          </li>
        ))}
        {!filtered.length && <li className="doc-empty">{docs.length ? 'No matches.' : 'No documents yet.'}</li>}
      </ul>

      <footer className="sidebar-foot" title={contentRoot}>
        {contentRoot}
      </footer>
    </aside>
  );
}
