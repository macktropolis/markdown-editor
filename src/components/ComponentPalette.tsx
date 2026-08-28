import { useEffect, useMemo, useRef, useState } from 'react';
import { isImageProp } from '../lib/mdx';
import type { ComponentGroup, ComponentInfo, SnippetResult } from '../lib/types';

interface Props {
  groups: ComponentGroup[];
  assets: string[];
  buildSnippet: (component: ComponentInfo, asset: string | null) => SnippetResult;
  onInsert: (result: SnippetResult) => void;
  onClose: () => void;
}

const imageProp = (component: ComponentInfo) => component.props.find(isImageProp);

export function ComponentPalette({ groups, assets, buildSnippet, onInsert, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [asset, setAsset] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const matches = useMemo(() => {
    const all = groups.flatMap((group) => group.components);
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (component) =>
        component.name.toLowerCase().includes(needle) ||
        component.description?.toLowerCase().includes(needle) ||
        component.props.some((prop) => prop.name.toLowerCase().includes(needle)),
    );
  }, [groups, query]);

  const active: ComponentInfo | undefined = matches[Math.min(selected, matches.length - 1)];
  const needsImage = active ? imageProp(active) : undefined;
  const chosenAsset = needsImage ? (asset ?? assets[0] ?? null) : null;

  // Moving to a different component drops a selection made for the previous one.
  useEffect(() => setAsset(null), [active?.relativePath]);

  const insert = (component: ComponentInfo) => {
    onInsert(buildSnippet(component, imageProp(component) ? (asset ?? assets[0] ?? null) : null));
    onClose();
  };

  const matchesRef = useRef(matches);
  const selectedRef = useRef(selected);
  const insertRef = useRef(insert);
  matchesRef.current = matches;
  selectedRef.current = selected;
  insertRef.current = insert;

  // Bound to the window so the shortcuts work no matter which element holds focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((i) => Math.min(i + 1, matchesRef.current.length - 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const component = matchesRef.current[Math.min(selectedRef.current, matchesRef.current.length - 1)];
        if (component) insertRef.current(component);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Insert component…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
        />

        <div className="palette-body">
          <ul className="palette-list">
            {matches.map((component, index) => (
              <li key={`${component.source}-${component.relativePath}`}>
                <button
                  type="button"
                  className={index === Math.min(selected, matches.length - 1) ? 'is-active' : ''}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => insert(component)}
                >
                  <span className="palette-name">{component.name}</span>
                  <span className="palette-source">{component.source}</span>
                </button>
              </li>
            ))}
            {!matches.length && <li className="palette-empty">No components match.</li>}
          </ul>

          {active && (
            <div className="palette-detail">
              <h3>{active.name}</h3>
              <p className="path">{active.relativePath}</p>
              {active.description && <p className="summary">{active.description}</p>}

              {needsImage && (
                <div className="image-picker">
                  <span className="picker-label">
                    <code>{needsImage.name}</code> takes an image from this document
                  </span>
                  {assets.length ? (
                    <div className="chips">
                      {assets.map((name) => (
                        <button
                          type="button"
                          key={name}
                          className={name === chosenAsset ? 'chip is-active' : 'chip'}
                          onClick={() => setAsset(name)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      No images here yet — drag one onto the editor first, then the import is written for you.
                    </p>
                  )}
                </div>
              )}

              {active.props.length ? (
                <table>
                  <tbody>
                    {active.props.map((prop) => (
                      <tr key={prop.name}>
                        <th>
                          {prop.name}
                          {prop.required && <span className="req">*</span>}
                        </th>
                        <td>
                          <code>{prop.type}</code>
                          {prop.default && <span className="muted"> = {prop.default}</span>}
                          {prop.doc && <span className="prop-doc">{prop.doc}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No Props interface found.</p>
              )}

              <pre className="snippet">
                {[...buildSnippet(active, chosenAsset).imports, buildSnippet(active, chosenAsset).snippet].join('\n')}
              </pre>
            </div>
          )}
        </div>

        <footer className="palette-footer">
          <span>↑↓ navigate · ⏎ insert · esc close</span>
          <span>{matches.length} components</span>
        </footer>
      </div>
    </div>
  );
}
