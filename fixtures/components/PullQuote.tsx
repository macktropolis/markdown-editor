/**
 * PullQuote — an oversized quotation, for framework components in MDX.
 *
 * Props:
 *   quote   — the quoted text, without surrounding quotation marks
 *   cite    — who said it
 *   source  — where they said it; rendered after `cite` in lighter type
 *   align   — 'left' | 'center'  (default 'center')
 */

interface Props {
  quote: string;
  cite?: string;
  source?: string;
  align?: 'left' | 'center';
}

export default function PullQuote({ quote, cite, source, align = 'center' }: Props) {
  return (
    <blockquote style={{ textAlign: align, margin: '2rem 0', fontSize: '1.35rem', lineHeight: 1.4 }}>
      <p style={{ margin: 0 }}>{quote}</p>
      {cite && (
        <footer style={{ marginTop: '0.6rem', fontSize: '0.8rem', opacity: 0.7 }}>
          {cite}
          {source && <span style={{ fontStyle: 'italic' }}>, {source}</span>}
        </footer>
      )}
    </blockquote>
  );
}
