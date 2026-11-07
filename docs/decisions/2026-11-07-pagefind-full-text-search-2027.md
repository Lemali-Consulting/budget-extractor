# Use Pagefind for full-text search of the 2027 budget

**Date:** 2026-11-07
**Status:** accepted

## Context

The site search (Fuse.js over `views/search-index.json`) did not search the body text of the budget. The index keeps only the first 200 characters of each prose block, capped at 500 per section, and Fuse's default location scoring drops matches more than a few dozen characters into a field. Words from the middle of a section's prose — "arbitration" in the Bureau of Police narrative, "Hutchinson" in the capital introduction — returned nothing. The same index is also passed as island props, so every page with a search box embeds it (~320 KB raw on 2027 pages).

## Decision

Use **Pagefind** for full-text search, scoped to the **2027 headline budget only** (choice of library and scope made by Max on 2026-11-07).

- Pagefind runs after `astro build` and indexes the built HTML. Only pages that opt in with `data-pagefind-body` are indexed: the 2027 operating section pages (`/sections/*`) and capital project pages (`/capital/*`). Archive routes (`/2026/...`) and every other page are not indexed.
- Page chrome inside indexed pages (navigation, table of contents, notices, PDF sidebar) is marked `data-pagefind-ignore`.
- Search boxes on headline pages use Pagefind; archive pages (2026, 2025, amendments, cross-year) keep the existing Fuse search unchanged.

## Alternatives Considered

Measured on 2026-11-07 against the built site and the committed data bundles:

- **MiniSearch** (records from `build_web_data.py`, full prose + row labels): ~44 KB gzipped for 2027, ~96 KB per archive year, ~224 KB for all three years; the whole index downloads at once. Would keep table-level result links and the existing search box. Not chosen in favour of Pagefind's lazy, chunked loading and zero data-pipeline changes.
- **FlexSearch**: fastest, but harder API and cruder ranking; speed is not the constraint here.
- **Orama**: capable but larger framework surface and faster-moving project.
- **Keep Fuse, set `ignoreLocation` and lift the caps**: cheapest change, but fuzzy matching over full text gets noisy and the whole index still embeds into each page.

Pagefind over the whole built site: 339 pages, 2.8 MB of index spread over ~35 KB chunks; a first query loads ~140 KB (script, WASM, manifest, one or a few chunks, ~2 KB per result fragment), only when the user searches. The section pages were verified to render all extracted prose and row labels, so Pagefind sees the full text.

## Consequences

- Search finds words anywhere in the 2027 section and capital project text, with stemming.
- Results link to pages (with heading anchors where available), not to individual tables.
- `npm run build` gains a Pagefind post-step; search does not work under `astro dev`, only on a built site.
- Glossary terms and "what changed" items are no longer surfaced by the headline search box, since those pages are not indexed.
- Headline pages stop embedding the Fuse search index.
- 2026 and 2025 search behaviour is unchanged and still has the prose-truncation limitation.
