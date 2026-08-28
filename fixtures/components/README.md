# Sample components

Fixtures for the component scanner. They exist so the palette has something to read in
any checkout — including cloud sessions, where the `componentDirs` entries pointing at
sibling repositories do not resolve.

Between them they cover every shape the scanner parses:

| File | Exercises |
| --- | --- |
| `Callout.astro` | JSDoc header with a wrapped continuation line; union literal with a default |
| `Figure.astro` | `ImageMetadata` prop, which drives the palette's image-import insertion |
| `StarRating.astro` | Required `number`, optional union, defaults destructured from `Astro.props` |
| `LinkGrid.astro` | `type Props = { … }` instead of an interface; array prop; inline comments |
| `PullQuote.tsx` | A `.tsx` component, to prove scanning is not Astro-only |

They are valid components, not stubs — copying one into a real Astro project works. But
like any `.astro` file, they render as placeholder cards in this editor's preview; only
an Astro build renders them for real.
