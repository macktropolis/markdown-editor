import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';

export interface EditorHandle {
  insert: (text: string, imports?: string[]) => void;
  /** Wrap the selection in markers, or drop them at the cursor ready to type between. */
  wrap: (before: string, after?: string) => void;
  /** Add or remove a line-start marker on every line the selection touches. */
  prefixLines: (prefix: string) => void;
  focus: () => void;
}

/**
 * Offset where a new import belongs: after any leading run of import statements,
 * or the very top of the document when there are none.
 */
function importInsertOffset(doc: string): number {
  const lines = doc.split('\n');
  let offset = 0;
  let target = 0;
  for (const line of lines) {
    const next = offset + line.length + 1;
    if (/^import\s/.test(line)) target = next;
    else if (line.trim() !== '') break;
    offset = next;
  }
  return target;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onFiles: (files: File[]) => void;
}

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px', backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7', padding: '1rem 0' },
  '.cm-content': { padding: '0 1.25rem', caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--text-faint)' },
  '.cm-activeLine': { backgroundColor: 'var(--surface-2)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-muted)' },
  '&.cm-focused': { outline: 'none' },
});

export const EditorPane = forwardRef<EditorHandle, Props>(function EditorPane({ value, onChange, onFiles }, ref) {
  const cm = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(ref, () => ({
    focus: () => cm.current?.view?.focus(),

    wrap(before, after = before) {
      const view = cm.current?.view;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const selected = view.state.doc.sliceString(from, to);

      // Wrapping an already-wrapped selection removes the markers instead.
      const already = selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length;
      const insert = already ? selected.slice(before.length, selected.length - after.length) : `${before}${selected}${after}`;
      const anchor = already ? from : from + before.length;

      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor, head: anchor + (already ? insert.length : selected.length) },
        scrollIntoView: true,
      });
      view.focus();
    },

    prefixLines(prefix) {
      const view = cm.current?.view;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const first = view.state.doc.lineAt(from);
      const last = view.state.doc.lineAt(to);

      const lines = [];
      for (let n = first.number; n <= last.number; n += 1) lines.push(view.state.doc.line(n));

      // If every touched line already carries the marker, toggle it off.
      const stripped = lines.every((line) => line.text.startsWith(prefix));
      const changes = lines.map((line) => ({
        from: line.from,
        to: line.from + (stripped ? prefix.length : 0),
        insert: stripped ? '' : prefix,
      }));

      view.dispatch({ changes, scrollIntoView: true });
      view.focus();
    },
    insert(text, imports = []) {
      const view = cm.current?.view;
      if (!view) return;
      const doc = view.state.doc.toString();
      const selection = view.state.selection.main;

      // A collapsed cursor sitting above the import block (typically because the
      // editor was never focused) would put the snippet before the import it needs.
      const importBlockEnd = importInsertOffset(doc);
      const from =
        selection.empty && selection.from < importBlockEnd ? importBlockEnd : selection.from;
      const to = selection.empty ? from : selection.to;

      // Keep inserted blocks on their own lines so MDX parses them as block-level JSX.
      const before = view.state.doc.sliceString(Math.max(0, from - 1), from);
      const prefix = from === 0 || before === '\n' ? '' : '\n';
      const snippet = `${prefix}${text}\n`;

      const missing = imports.filter((statement) => !doc.includes(statement));
      const importOffset = missing.length ? importBlockEnd : 0;
      // A brand-new import block needs a blank line before the prose that follows.
      const importText = missing.length
        ? `${missing.join('\n')}\n${importOffset === 0 && doc.trim() ? '\n' : ''}`
        : '';

      // Two insertions at the same offset would be ambiguous, so merge them.
      // Otherwise CodeMirror needs the changes in ascending document order.
      const changes =
        !importText || importOffset === from
          ? [{ from, to, insert: `${importText}${snippet}` }]
          : [
              { from: importOffset, to: importOffset, insert: importText },
              { from, to, insert: snippet },
            ].sort((a, b) => a.from - b.from);

      const shift = importOffset <= from ? importText.length : 0;
      view.dispatch({
        changes,
        selection: { anchor: from + shift + snippet.length },
        scrollIntoView: true,
      });
      view.focus();
    },
  }));

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      const files = Array.from(event.dataTransfer.files);
      if (!files.length) return;
      event.preventDefault();
      onFiles(files);
    },
    [onFiles],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = Array.from(event.clipboardData.files);
      if (!files.length) return;
      event.preventDefault();
      onFiles(files);
    },
    [onFiles],
  );

  return (
    <div className="editor-pane" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onPaste={handlePaste}>
      <CodeMirror
        ref={cm}
        value={value}
        onChange={onChange}
        theme="dark"
        extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping, theme]}
        basicSetup={{ foldGutter: false, highlightActiveLine: true, lineNumbers: true, autocompletion: false }}
      />
    </div>
  );
});
