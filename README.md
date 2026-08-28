# Markdown Editor

A local writing tool for `.mdx` / `.md` blog posts. Split-pane source + preview,
frontmatter as a form, an image drop zone, and a component palette that reads the
real `Props` interfaces out of your Astro projects.

Documents are plain files on disk. Nothing is stored in a database, and nothing
leaves your machine.

## Running it

```bash
npm install && npm run dev
```

Then open http://localhost:4321. `npm run dev` runs one process — Vite serves the UI
and the file API together.

For a build you can leave running:

```bash
npm start
```

## How documents are stored

One folder per document, images alongside the text:

```
content/
  my-post/
    index.mdx
    cover.webp
```

Deleting a document moves its folder to `content/.trash/` — nothing is removed
permanently, so recovering a mistake is a `mv`.

## Configuration

`editor.config.json`, re-read on every request (no restart needed):

| Key | Purpose |
| --- | --- |
| `contentRoot` | Where documents live. Point it at a blog repo's content directory to edit posts in place. |
| `defaultExtension` | `mdx` or `md` for new documents. |
| `componentDirs` | Directories scanned for components. Each is `{ "label", "path" }`, relative to this project. |
| `frontmatterFields` | The fields the frontmatter form shows, in order. |

Frontmatter field types: `string`, `text`, `date`, `list`, `boolean`, `number`, `image`.
Any key present in a document but absent from this list still appears in the form,
with its type inferred — so pointing the editor at a blog with a different schema
loses nothing.

## Components

The scanner walks each `componentDirs` entry for `.astro`, `.tsx`, and `.jsx` files
and parses the `interface Props` / `type Props` block plus any defaults destructured
from `Astro.props`. `⌘K` opens the palette; picking a component inserts a snippet
with its required props stubbed in.

Prop descriptions come from block comments. Inline comments inside the Props block
work, and so does a JSDoc header listing props as `name — description` — including
the wrapped continuation lines those headers tend to use. The header need not sit
directly above the interface, since components often put it at the top of the file.

A prop typed `ImageMetadata` needs an import binding rather than a string, so the
palette offers the images in the current document and writes both lines for you:

```mdx
import img3dGlasses from './3d-glasses.png';

<FloatImage src={img3dGlasses} alt="" />
```

If that image is already imported, the existing binding is reused instead of a second
import. Snippets are never placed above the import block they depend on.

In the preview, MDX component tags render as labeled placeholder blocks listing the
props you passed. They cannot render for real here — `.astro` components only execute
during an Astro build. The placeholder confirms the tag parses and the props are what
you meant; Astro renders the actual component when you build the site.

## Shortcuts

| Key | Action |
| --- | --- |
| `⌘S` | Save now (documents also autosave ~1.2s after you stop typing) |
| `⌘K` | Component palette |
| `⇧⌘P` | Toggle the preview pane |

Drag an image onto the editor, or paste one from the clipboard, and it is copied into
the document's folder with a markdown reference inserted at the cursor.

## Layout

```
server/     File API — config, document CRUD, assets, component scanning
src/        React UI (editor, preview, frontmatter form, palette)
content/    Your documents
```

`server/api.js` is mounted into Vite's dev server by a plugin in `vite.config.ts`,
and served by `server/index.js` in production — the same handler either way.
