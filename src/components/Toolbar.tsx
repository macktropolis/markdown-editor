import type { EditorHandle } from './EditorPane';

interface Props {
  editor: React.RefObject<EditorHandle | null>;
  onChanged: () => void;
  onOpenPalette: () => void;
}

interface Action {
  label: string;
  title: string;
  run: (editor: EditorHandle) => void;
}

const ACTIONS: (Action | 'separator')[] = [
  { label: 'B', title: 'Bold', run: (e) => e.wrap('**') },
  { label: 'I', title: 'Italic', run: (e) => e.wrap('*') },
  { label: '</>', title: 'Inline code', run: (e) => e.wrap('`') },
  'separator',
  { label: 'H1', title: 'Heading 1', run: (e) => e.prefixLines('# ') },
  { label: 'H2', title: 'Heading 2', run: (e) => e.prefixLines('## ') },
  { label: 'H3', title: 'Heading 3', run: (e) => e.prefixLines('### ') },
  'separator',
  { label: 'Link', title: 'Link', run: (e) => e.wrap('[', '](https://)') },
  { label: 'Quote', title: 'Blockquote', run: (e) => e.prefixLines('> ') },
  { label: 'List', title: 'Bullet list', run: (e) => e.prefixLines('- ') },
  { label: 'Code', title: 'Code block', run: (e) => e.insert('```\n\n```') },
  { label: 'HR', title: 'Horizontal rule', run: (e) => e.insert('---') },
];

export function Toolbar({ editor, onChanged, onOpenPalette }: Props) {
  const run = (action: Action) => {
    const handle = editor.current;
    if (!handle) return;
    action.run(handle);
    onChanged();
  };

  return (
    <div className="format-bar">
      {ACTIONS.map((action, index) =>
        action === 'separator' ? (
          <span key={`sep-${index}`} className="format-sep" />
        ) : (
          <button
            key={action.label}
            type="button"
            className="fmt"
            title={action.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(action)}
          >
            {action.label}
          </button>
        ),
      )}
      <span className="format-sep" />
      <button type="button" className="fmt fmt-component" onClick={onOpenPalette} title="Insert a component (⌘K)">
        Component
      </button>
    </div>
  );
}
