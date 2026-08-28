import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseSegments } from '../lib/mdx';
import { assetUrl } from '../lib/api';

interface Props {
  body: string;
  slug: string;
  mode: 'draft' | 'rendered';
  previewUrl: string | null;
  /** Bumped on each save so the live page reloads with the new content. */
  reloadKey: number;
}

/** Rewrite relative image paths to the asset endpoint so local images render. */
function resolveSrc(src: string | undefined, slug: string): string | undefined {
  if (!src) return src;
  if (/^(https?:|data:|\/)/.test(src)) return src;
  // A document's images all live in one directory, so the final segment identifies them
  // whichever prefix the layout requires.
  return assetUrl(slug, src.split('/').pop() ?? src);
}

export function PreviewPane({ body, slug, mode, previewUrl, reloadKey }: Props) {
  const segments = useMemo(() => parseSegments(body), [body]);

  if (mode === 'rendered') {
    const src = previewUrl ? previewUrl.replace('{slug}', encodeURIComponent(slug)) : null;
    return (
      <div className="preview-pane preview-rendered">
        {src ? (
          // Keyed on the save counter so each save remounts the frame and refetches.
          <iframe key={reloadKey} src={src} title="Rendered page" />
        ) : (
          <div className="prose">
            <p className="empty-hint">
              No rendered URL is configured. Set <code>previewUrl</code> to show the live page here.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="preview-pane">
      <article className="prose">
        {segments.map((segment, index) => {
          if (segment.kind === 'meta') {
            return (
              <div key={index} className="preview-meta">
                <span className="tag">imports</span>
                <code>{segment.text}</code>
              </div>
            );
          }

          if (segment.kind === 'component') {
            return (
              <div key={index} className="preview-component">
                <header>
                  <span className="tag">component</span>
                  <strong>{segment.name}</strong>
                </header>
                {segment.attributes.length > 0 && (
                  <dl>
                    {segment.attributes.map(([name, value]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="hint">Renders at build time in Astro.</p>
              </div>
            );
          }

          return (
            <ReactMarkdown
              key={index}
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ src, alt }) => <img src={resolveSrc(typeof src === 'string' ? src : undefined, slug)} alt={alt ?? ''} />,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {children}
                  </a>
                ),
              }}
            >
              {segment.text}
            </ReactMarkdown>
          );
        })}
        {!segments.length && <p className="empty-hint">Nothing to preview yet — start writing.</p>}
      </article>
    </div>
  );
}
