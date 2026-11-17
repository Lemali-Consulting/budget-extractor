# SEO metadata and Public Source's analytics tags on every page

**Date:** 2026-11-13
**Status:** accepted

## Context

Public Source asked for SEO on the site and for its Google Analytics (`G-CCLXQK5C14`) and Parse.ly (`publicsource.org` key) tags on every page (request relayed by Max, 2026-11-13).

Before this change, pages had a description and Open Graph title/description, but:

- the canonical/share URL (`og:url`) was the build machine's address (`http://localhost:4321/...`), because the Astro config had no `site`;
- there was no `<link rel="canonical">`, sitemap or robots.txt;
- 34 department and citywide section pages and 7 single pages shared one generic description;
- the home page's title was "Home | Pittsburgh Budget Explorer".

## Decision

- **One production address.** `web/src/lib/site.mjs` holds `SITE_URL` (`https://budget.publicsource.org`, the public address; the same Netlify site also answers at `pgh-budget-explorer.netlify.app` — Max, 2026-11-13), the site name and the publisher. It feeds Astro's `site`, every canonical link and `og:url`, the sitemap, robots.txt and the embed snippet. Moving to another domain is a one-line change there.
- **Head metadata** (`web/src/layouts/Base.astro`): canonical link, `og:site_name`, `og:locale`, a Twitter `summary` card, `author`, and schema.org `WebPage` JSON-LD naming Public Source as publisher (also read by Parse.ly). The home page's title is the site's name.
- **A description per page.** Every published page has its own; department and citywide section pages generate theirs from the section name. Descriptions avoid figures so they add nothing new to fact-check.
- **`/sitemap.xml` and `/robots.txt`** are generated from the site's own list of published pages (`publishedPagePaths` in `web/src/lib/published-pages.ts`); the test suite checks the sitemap against its hand-written list of 46.
- **Analytics tags verbatim**, in `web/src/components/Analytics.astro`, only in built pages: `astro dev` leaves them out so local work isn't counted as readership.
- **Tests never reach the analytics services.** Every spec imports `test` from `web/tests/test-base.ts`, which answers Google and Parse.ly script requests locally with an empty body. This keeps test runs out of Public Source's numbers and keeps the suite working offline.

## Alternatives considered

- **`@astrojs/sitemap`.** Would list every built page; generating from the published-page list is as short and ties the sitemap to the 46-page rule.
- **Loading analytics only on the production hostname** (checked at runtime). Rejected: it would silently stop tracking if the site moved to a custom domain without a code change.
- **A social preview image (`og:image`).** Not added at first; it needed a designed card. *Superseded 2026-11-17:* Max chose one site-wide card (no figures, so nothing to fact-check) over a card per page; every page now shares `public/social-card.png` as a large image, rendered from `web/social-card/site-card.html`.

## Consequences

- Building locally and opening the result with `astro preview` or a local HTTP server loads the real tags and sends hits to Public Source's GA property (GA records the hostname, so they can be filtered).
- Both addresses serve the site with no redirect between them (checked 2026-11-13). The canonical links tell search engines to index the Public Source address; making it the primary domain in Netlify's settings would also redirect netlify.app visitors there.
- If the site moves again, change `SITE_URL` and redeploy; canonical links, sitemap and robots follow.
