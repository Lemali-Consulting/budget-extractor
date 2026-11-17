# Add a site map page

**Date:** 2026-11-17
**Status:** accepted

## Context

Public Source fact-checked the site page by page against a 43-page list. Max wanted a way for Public Source to be confident that the pages cut at the fact-check (Grants, the Public Works parent, the data explorer, the 2026 archive and others) are not on the site.

The site already had `/sitemap.xml`, built from the published-page list, but it is for search engines and isn't readable by a person.

The options put to Max:

- (a) A new page at `/sitemap/`, linked from the footer. This makes 44 pages.
- (b) A section at the bottom of the About page. The count stays at 43.
- (c) No page; point Public Source at `/sitemap.xml` and describe what the tests check.

A second question was whether to list the retired pages and where their old addresses now redirect. The other option was to list only the published pages.

Max chose (a), with only the published pages (2026-11-17).

## Decision

- **`/sitemap/` lists every published page under its own title,** grouped as overviews and tools (12), departments (27) and citywide sections (5). Every page's footer links to it.
- **It is built from the same list as the build, `/sitemap.xml` and the page-count test** (`web/src/lib/published-pages.ts`), so it can't name a page that isn't published or miss one that is. `web/tests/sitemap-page.spec.ts` checks that it links each published page once and nothing else, and that each entry's name matches its page's title.
- **The site publishes 44 pages,** still under Public Source's limit of 50. The new page holds links only, with no budget figures to fact-check.

## Consequences

- A sitemap shows what is listed, not that the cut pages are gone. That is shown by the page-count test (only the 44 pages are built), the link crawl (no page links anywhere else) and `web/public/_redirects` (old addresses land on a live page).
- Adding or retiring a page updates the site map with no further change.
