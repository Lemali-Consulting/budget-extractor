# Optimize Image Storage with WebP, Lower DPI, Gitignore, and Lazy Loading

**Date:** 2026-03-15
**Status:** accepted

## Context

The web app stores 566 PNG images (~123 MB) committed to git, comprising 91% of the 136 MB dist size. These are rasterized PDF pages and chart crops served as a static Netlify site on the free tier. As more budget years are added, both repo size and deploy size will grow linearly. An audit (`docs/audits/2026-03-15-image-storage-optimization.md`) identified five optimization options ranked by impact and effort.

## Decision

Implement the first four optimizations from the audit:

1. **Convert to WebP** — change `render_page_images.py` and `extract_chart_images.py` to output `.webp` instead of `.png`. Update all image path references in the Astro/Preact components. Expected ~60-70% size reduction.

2. **Lower DPI** — reduce chart image DPI from 200 to 150, page image DPI from 150 to 120. Verify visual quality is acceptable at new settings.

3. **Gitignore generated images** — add `web/public/charts/` and `web/public/pages/` to `.gitignore`. Add image regeneration to the deploy process so images are rebuilt from source PDFs before `astro build`.

4. **Add lazy loading** — add `loading="lazy"` to `<img>` tags in `PageImage.tsx` and capital `[slug].astro`.

## Alternatives Considered

- **Astro `<Image>` component (option E)**: Would automate format conversion and responsive sizing at build time, but requires moving images from `public/` to `src/assets/`, restructuring component code, and increases build time. May be worth revisiting later — see discussion below.
- **Git LFS**: Would reduce clone impact of binary assets but adds infrastructure complexity. Gitignoring and regenerating is simpler since images are fully reproducible.
- **Keep PNGs, only add lazy loading**: Minimal effort but misses the largest wins (format + DPI account for ~75% of potential savings).

## Consequences

- Dist size drops from ~136 MB to an estimated ~25-35 MB
- Git repo sheds ~123 MB of tracked binaries (historical bloat remains unless repo is rewritten)
- Deploy process becomes longer — must run image generation scripts before build
- Source PDFs must be available at deploy time
- All modern browsers support WebP; no compatibility concerns
- Visual quality at lower DPI should be verified before finalizing

## Future Optimization: Astro Image Component (Option E)

Astro's `<Image>` component could auto-generate responsive sizes and serve AVIF to supporting browsers. Deferred as a nice-to-have — options A-D capture the majority of the savings, and the images are viewed at fairly consistent sizes (lightbox, inline chart) where responsive srcsets add limited value. Revisit if the site adds more image-heavy pages or needs AVIF support.
