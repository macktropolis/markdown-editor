# astro-content-editor

A local writing tool for `.mdx` / `.md` blog posts. Split-pane source + preview,
frontmatter as a form, an image drop zone, and a component palette that reads the
real `Props` interfaces out of your Astro projects.

Documents are plain files on disk. Nothing is stored in a database, and nothing
leaves your machine.

## Installing into an Astro site

The editor mounts into `astro dev` as an integration. It reads that site's own content
directory and components, so the components it offers are always ones the document can
actually use.

```js
// astro.config.mjs
import contentEditor from 'astro-content-editor';

export default defineConfig({
  integrations: [
    mdx(),
    contentEditor({ collection: 'essays', previewUrl: '/essays/{slug}' }),
  ],
});
```

Run `astro dev` and open `/editor`.

**Dev only, by design.** The integration returns early unless the command is `dev`, so
the file-writing API cannot exist in a built site.

| Option | Default | Purpose |
| --- | --- | --- |
| `collection` | — | Content collection to edit. Sets the content directory and preview URL. |
| `route` | `/editor` | Where the editor mounts. |
| `contentDir` | `content/<collection>` | Override, relative to `srcDir`. |
| `previewUrl` | `/<collection>/{slug}` | Live page URL for the Rendered tab. |
| `componentDirs` | `[{ label: 'Components', path: 'components' }]` | Directories to scan. |
| `frontmatterFields` | title, description, pubDate, tags, draft | Fields the form shows. |
| `defaultExtension` | `mdx` | Extension for new documents. |

Changing the editor's own server code requires restarting `astro dev` — Node caches the
package's modules, and Astro's hot reload does not cover them.

### Installing from git

The package is not on npm. Install it from its repository, which keeps a template site
reproducible for anyone who clones it:

```bash
npm install github:macktropolis/markdown-editor
```

The built bundle is not committed; npm runs `prepare` on git installs and builds it. Both
repositories are private, so whoever installs the template needs access to this one too.

### Working on the editor itself

Point a host site at a local checkout without disturbing the pinned dependency:

```bash
npm install ../markdown-editor --no-save
```

That symlinks `node_modules/astro-content-editor` to your working copy while leaving the
git URL in `package.json`, so edits are live and the committed template stays correct. A
later `npm install` restores the pinned version, which is the intended way back.

`npm link` does the same thing but writes to the global prefix, which needs sudo on a
default macOS install; the command above avoids that.

### Document layouts

Both shapes are supported, detected from what is already in the directory:

- **flat** — `essays/my-post.mdx`, which is what Astro's `glob` loader expects. Images
  go in `essays/my-post/` and are referenced as `./my-post/cover.png`.
- **folder** — `essays/my-post/index.mdx` with images beside it, referenced as
  `./cover.png`.

An empty directory falls back to flat under the integration, folder standalone.

### Rendered preview

The Rendered tab iframes the live page from the same dev server. Saving writes the file,
Astro hot-reloads, and the frame reloads — so you see the real components, real styles,
and real layout, not an approximation. Astro build errors show up there too.

This only works where the collection is file-backed. A collection with a custom loader
(pulling from a sheet or an API) does not read your files, so saving one will not change
what the page shows.

## Running it standalone


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

Paths are relative to this project, which means `componentDirs` entries pointing at
sibling repositories only resolve on the machine those siblings live on. For a clone
elsewhere, create `editor.config.local.json` — it is git-ignored and its top-level keys
override the shared config:

```json
{ "componentDirs": [{ "label": "Local", "path": "./some/components" }] }
```

A configured directory that cannot be read is named in the palette, so an empty
component list is never left unexplained.

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
