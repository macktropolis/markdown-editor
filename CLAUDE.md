# astro-content-editor

A content editor that mounts into `astro dev`, plus a standalone harness for developing
it. See `README.md` for usage; this file records the decisions the code does not explain.

## Shape

The deliverable is an **Astro integration** (`integration/index.js`), installed per site.
It is not a standalone app you point at several projects: components belong to a site, so
an editor that scanned many sites would offer tags that cannot resolve in the document
being written. `npm run dev` still runs a standalone harness for working on the UI itself.

## Run it

```bash
npm install && npm run dev   # http://localhost:4321
```

One process: Vite serves the UI, and `server/api.js` is mounted into its dev server as
middleware. `npm start` builds and serves the same handler from `server/index.js`.

**Not every collection is file-backed.** Astro collections can use custom loaders. The
RetroCult site loads `articles` from a Google Sheet and pre-renders the HTML in the
loader, so its `src/content/articles/*.mdx` files are inert and its editor is
clipboard-to-spreadsheet by necessity. Check `content.config.ts` for a `glob` loader
before assuming that saving a file changes what a page shows.

## Decisions already made — do not re-litigate

**The stack is Vite + React + a small Node server, not Astro.** Astro was the owner's
first instinct, specifically to reuse existing `.astro` components. It was ruled out
because Astro SSG cannot write files at runtime, and the editor's whole purpose is
writing files. Do not propose porting to Astro.

**Component previews are labeled placeholder cards, by design.** `.astro` components
only execute during an Astro build, so nothing client-side can render them. The preview
shows the parsed tag name and its props to confirm the JSX is well-formed; Astro renders
the real component when the blog builds. This is a deliberate trade, not a gap to fix.
Rendering them for real would need a running Astro SSR server doing a round-trip per
keystroke.

**Documents are folders, not files.** `content/<slug>/index.mdx` with images alongside,
matching Astro content collections and keeping assets with the post. Deleting moves the
folder to `content/.trash/` — nothing is ever hard-deleted.

## Environment-specific configuration

`editor.config.json` is shared and committed. Its `componentDirs` paths are relative to
this project and point at **sibling repositories on the owner's Mac** — by default
`../retrocult-com-202608-claude/src/components`.

**That path will not exist in a cloud session or a fresh clone.** The palette reports
this explicitly rather than appearing empty. To point it somewhere real, create
`editor.config.local.json` (git-ignored); its top-level keys override the shared config:

```json
{ "componentDirs": [{ "label": "Local", "path": "./some/components" }] }
```

Consequence for cloud work: changes to the component palette cannot be verified there
without a directory of `.astro` files to scan. Code changes to everything else are fine.

## Layout

```
server/     File API — config, document CRUD, assets, component scanning
src/        React UI (editor, preview, frontmatter form, palette)
content/    The owner's documents (tracked deliberately, so drafts sync across machines)
```

## Conventions

- Verify UI changes by running the app and looking at it, not by reasoning about the
  code. Past bugs here (insert ordering, import placement) were only visible on screen.
- The component scanner parses `.astro` frontmatter fences with regex, not a real parser.
  It handles `interface Props` / `type Props`, defaults destructured from `Astro.props`,
  and JSDoc prop docs including wrapped continuation lines. Prefer extending that parsing
  over adding an Astro compiler dependency.
- Documents autosave ~1.2s after typing stops. When editing files on disk directly while
  the app is open, restart or reload — an open tab holds its own copy and will save over
  outside changes.
