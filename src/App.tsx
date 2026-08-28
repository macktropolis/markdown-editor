import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './lib/api';
import {
  collectIdentifiers,
  componentSnippet,
  existingImportIdentifier,
  imageIdentifier,
  isImageProp,
  joinDocument,
  splitDocument,
} from './lib/mdx';
import type { ComponentGroup, ComponentInfo, Doc, DocSummary, EditorConfig } from './lib/types';
import { ComponentPalette } from './components/ComponentPalette';
import { EditorPane, type EditorHandle } from './components/EditorPane';
import { FrontmatterForm } from './components/FrontmatterForm';
import { PreviewPane } from './components/PreviewPane';
import { Sidebar } from './components/Sidebar';

const AUTOSAVE_DELAY = 1200;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function App() {
  const [config, setConfig] = useState<EditorConfig | null>(null);
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [frontmatterText, setFrontmatterText] = useState('');
  const [body, setBody] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const editorRef = useRef<EditorHandle>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ frontmatterText: '', body: '', slug: '' });
  latest.current = { frontmatterText, body, slug: doc?.slug ?? '' };

  const refreshDocs = useCallback(() => api.listDocs().then(setDocs).catch((e) => setError(e.message)), []);

  useEffect(() => {
    Promise.all([api.config(), api.components(), api.listDocs()])
      .then(([nextConfig, nextGroups, nextDocs]) => {
        setConfig(nextConfig);
        setGroups(nextGroups);
        setDocs(nextDocs);
      })
      .catch((e) => setError(e.message));
  }, []);

  const openDoc = useCallback(async (slug: string) => {
    try {
      const next = await api.readDoc(slug);
      const parsed = splitDocument(next.raw);
      setDoc(next);
      setFrontmatterText(parsed.frontmatterText);
      setBody(parsed.body);
      setSaveState('idle');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const save = useCallback(async () => {
    const { slug, frontmatterText: fm, body: text } = latest.current;
    if (!slug) return;
    setSaveState('saving');
    try {
      const saved = await api.saveDoc(slug, joinDocument(fm, text), doc?.extension ?? 'mdx');
      setDoc((current) => (current && current.slug === slug ? { ...current, ...saved } : current));
      setSaveState('saved');
      refreshDocs();
    } catch (e) {
      setSaveState('error');
      setError((e as Error).message);
    }
  }, [doc?.extension, refreshDocs]);

  const markDirty = useCallback(() => {
    setSaveState('dirty');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, AUTOSAVE_DELAY);
  }, [save]);

  const changeBody = useCallback(
    (value: string) => {
      setBody(value);
      markDirty();
    },
    [markDirty],
  );

  const changeFrontmatter = useCallback(
    (value: string) => {
      setFrontmatterText(value);
      markDirty();
    },
    [markDirty],
  );

  const createDoc = useCallback(async () => {
    const title = window.prompt('Title for the new document');
    if (title === null) return;
    try {
      const created = await api.createDoc(title.trim() || 'Untitled', config?.defaultExtension ?? 'mdx');
      await refreshDocs();
      await openDoc(created.slug);
      editorRef.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [config?.defaultExtension, openDoc, refreshDocs]);

  const renameDoc = useCallback(
    async (slug: string) => {
      const next = window.prompt('New folder name (slug)', slug);
      if (!next || next === slug) return;
      try {
        const renamed = await api.renameDoc(slug, next);
        await refreshDocs();
        if (latest.current.slug === slug) await openDoc(renamed.slug);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [openDoc, refreshDocs],
  );

  const deleteDoc = useCallback(
    async (slug: string) => {
      if (!window.confirm(`Move "${slug}" to content/.trash? Nothing is deleted permanently.`)) return;
      try {
        await api.trashDoc(slug);
        await refreshDocs();
        if (latest.current.slug === slug) {
          setDoc(null);
          setBody('');
          setFrontmatterText('');
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [refreshDocs],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const slug = latest.current.slug;
      if (!slug) return;
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const { filename } = await api.uploadAsset(slug, file.name, file.type, await fileToBase64(file));
          const alt = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
          editorRef.current?.insert(`![${alt}](${filename})`);
          setDoc(await api.readDoc(slug));
          markDirty();
        } catch (e) {
          setError((e as Error).message);
        }
      }
    },
    [markDirty],
  );

  const buildSnippet = useCallback(
    (component: ComponentInfo, asset: string | null) => {
      const prop = component.props.find(isImageProp);
      if (!prop || !asset) return componentSnippet(component);
      const body = latest.current.body;
      const path = `./${asset}`;
      // Reuse the binding if this image is already imported, rather than importing it twice.
      const identifier = existingImportIdentifier(body, path) ?? imageIdentifier(asset, collectIdentifiers(body));
      return componentSnippet(component, { prop: prop.name, identifier, path });
    },
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (saveTimer.current) clearTimeout(saveTimer.current);
        save();
      }
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (mod && event.key.toLowerCase() === 'p' && event.shiftKey) {
        event.preventDefault();
        setShowPreview((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const timer = setTimeout(() => setSaveState('idle'), 1600);
    return () => clearTimeout(timer);
  }, [saveState]);

  const statusLabel: Record<SaveState, string> = {
    idle: doc ? 'Saved' : '',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  };

  return (
    <div className="app">
      <Sidebar
        docs={docs}
        activeSlug={doc?.slug ?? null}
        contentRoot={config?.contentRootAbs ?? ''}
        onSelect={openDoc}
        onCreate={createDoc}
        onRename={renameDoc}
        onDelete={deleteDoc}
      />

      <main className="main">
        {doc ? (
          <>
            <div className="toolbar">
              <div className="toolbar-title">
                <strong>{doc.slug}</strong>
                <span className="muted">/index.{doc.extension}</span>
              </div>
              <div className="toolbar-actions">
                <span className={`status status-${saveState}`}>{statusLabel[saveState]}</span>
                <button type="button" className="btn" onClick={() => setPaletteOpen(true)}>
                  Insert component <kbd>⌘K</kbd>
                </button>
                <button type="button" className="btn" onClick={() => setShowPreview((v) => !v)}>
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>
            </div>

            <FrontmatterForm
              text={frontmatterText}
              onChange={changeFrontmatter}
              fields={config?.frontmatterFields ?? []}
              assets={doc.assets}
            />

            <div className={`split ${showPreview ? '' : 'single'}`}>
              <EditorPane ref={editorRef} value={body} onChange={changeBody} onFiles={uploadFiles} />
              {showPreview && <PreviewPane body={body} slug={doc.slug} />}
            </div>
          </>
        ) : (
          <div className="placeholder">
            <h2>No document open</h2>
            <p>Pick one from the list, or create a new document to start writing.</p>
            <button type="button" className="btn btn-primary" onClick={createDoc}>
              New document
            </button>
          </div>
        )}
      </main>

      {paletteOpen && (
        <ComponentPalette
          groups={groups}
          assets={doc?.assets ?? []}
          buildSnippet={buildSnippet}
          onInsert={(result) => {
            editorRef.current?.insert(result.snippet, result.imports);
            markDirty();
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
