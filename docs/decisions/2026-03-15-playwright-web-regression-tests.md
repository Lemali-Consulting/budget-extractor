# Add Playwright Smoke Tests for Web App

**Date:** 2026-03-15
**Status:** accepted

## Context

The Astro static site has no tests. Changes to data pipelines, templates, or styling could break the site without detection. The existing regression suite only covers CSV extraction, not the final rendered output.

## Decision

Add Playwright-based smoke tests that build the site, serve it locally, and verify key pages render correctly with expected content. Tests will check for:

- Pages load without errors (no console errors, no 404s)
- Expected content is present (department names, budget figures, navigation)
- Key routes resolve (home, department pages, revenue, capital projects)

This is a lightweight smoke-test approach — not pixel-perfect visual regression — focused on catching broken builds, missing data, and routing failures.

## Alternatives Considered

- **Build-only verification** (`npm run build`): Catches import/type errors but misses runtime rendering issues, broken links, or missing data that only shows up in the browser.
- **Visual regression (screenshot diffing)**: High maintenance burden — screenshots break on any intentional styling change, producing false positives. Not worth it for a project of this size.
- **Unit tests on components**: The site is mostly data-driven templates with minimal logic; unit tests would add boilerplate without meaningful coverage.
- **Data integrity checks only**: Validates JSON structure but wouldn't catch template or routing regressions.

## Consequences

- Playwright becomes a dev dependency of the web app
- Tests require a build + local serve step before running, making them slower than unit tests (~10-20s)
- Provides confidence that data pipeline changes don't break the user-facing site
- Test suite should be run before deploying to Netlify
