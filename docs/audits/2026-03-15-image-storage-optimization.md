# Image Storage Audit

**Date:** 2026-03-15
**Purpose:** Assess current image storage, formats, and sizes to identify optimization opportunities before the site grows further. The web app is a static Netlify site where total deploy size and git repo size matter.

## Current state

### Image inventory

| Category | Count | Size | Format | DPI | Location |
|----------|-------|------|--------|-----|----------|
| Page images | 425 | ~86 MB | PNG | 150 | `web/public/pages/{slug}/P{page}.png` |
| Chart images | 141 | ~37 MB | PNG | 200 | `web/public/charts/{slug}/P{page}C{index}.png` |
| **Total** | **566** | **~123 MB** | | | |

Built dist size: **136 MB** (images account for ~91% of it).

### How images are generated

Three scripts in `scripts/`:

1. **`render_page_images.py`** — renders full PDF pages at 150 DPI via PyMuPDF. Used for the "view source page" lightbox (`PageImage.tsx`).
2. **`extract_chart_images.py`** — crops chart regions from PDF pages at 200 DPI via pdfplumber + PIL. Displayed inline on capital section pages.
3. **`render_judge_images.py`** — renders pages with tables at 150 DPI for LLM-based quality judgment. Development-only; output is gitignored.

### How images are referenced in the web app

- `PageImage.tsx` — lightbox component, loads `/pages/{slug}/P{page}.png` on demand
- `[slug].astro` (capital) — inline `<img>` tags for chart regions: `/charts/{slug}/{filename}.png`
- No `loading="lazy"`, no Astro `<Image>` component, no responsive sizes
- All images served as static files from `public/`

### Git status

- **Committed:** all 566 images in `web/public/charts/` and `web/public/pages/` (~123 MB of binary data in the repo)
- **Gitignored:** debug regression images (`output/regression/debug/`), judge images

## Problems identified

### 1. PNG is the wrong format for this content

These are rasterized PDF pages — continuous-tone, photographic-ish content. PNG's lossless compression is designed for flat graphics with sharp edges and few colors. WebP (lossy or lossless) typically achieves **60-70% smaller files** on this type of content with no visible quality loss.

### 2. DPI is higher than needed for web display

- Chart images at 200 DPI are rendered larger than they're ever displayed on screen. 150 DPI (or 120) would suffice.
- Page images at 150 DPI are viewed in a lightbox overlay — 100-120 DPI would likely be adequate for the "see the original page" use case.

### 3. 123 MB of binary assets committed to git

Git stores every version of every binary file forever. The repo will grow linearly with each regeneration. Cloning becomes slower over time. These images are fully reproducible from the source PDFs + scripts.

### 4. No lazy loading

All page/chart images load eagerly. Most are below the fold or behind a lightbox click. This wastes bandwidth on every page visit.

### 5. No build-time image optimization

Astro's `<Image>` component can generate multiple sizes and modern formats at build time, but images in `public/` bypass this pipeline entirely.

## Optimization options

### A. Convert to WebP in generation scripts (high impact, low effort)

Change `render_page_images.py` and `extract_chart_images.py` to save as `.webp` instead of `.png`. Update file extension references in the Astro/Preact components.

- **Expected savings:** ~60-70% → ~123 MB down to ~40-50 MB
- **Effort:** small — Pillow and PyMuPDF both support WebP output natively
- **Risk:** none — WebP has universal browser support (97%+ globally)

### B. Reduce DPI (medium impact, trivial effort)

Lower chart DPI from 200 → 150, page DPI from 150 → 120.

- **Expected savings:** ~30-50% additional reduction
- **Effort:** change one constant per script
- **Risk:** low — should verify visual quality is acceptable at new DPI

### C. Gitignore images, regenerate on deploy (high impact, medium effort)

Add `web/public/charts/` and `web/public/pages/` to `.gitignore`. Add a regeneration step to the deploy process (run the image scripts before `astro build`).

- **Expected savings:** removes ~123 MB from git tracking
- **Effort:** update `.gitignore`, update deploy command in CLAUDE.md, ensure PDFs are available at build time
- **Risk:** deploy takes longer (image generation adds time); source PDFs must be present

### D. Add lazy loading to image tags (low-medium impact, trivial effort)

Add `loading="lazy"` to `<img>` tags in `PageImage.tsx` and capital `[slug].astro`.

- **Expected savings:** reduced bandwidth per page visit (no storage savings)
- **Effort:** one-line change per component
- **Risk:** none

### E. Use Astro Image component (medium impact, medium effort)

Move images from `public/` to `src/assets/` and use Astro's `<Image>` component for automatic format conversion, resizing, and optimization at build time.

- **Expected savings:** handles format + sizing automatically
- **Effort:** restructure image paths, update components, may increase build time
- **Risk:** build time increase; more complex asset pipeline

## Recommended approach

Combine **A + B + C + D** for maximum impact with manageable effort:

1. **WebP conversion** — change format in generation scripts
2. **Lower DPI** — reduce chart DPI to 150, page DPI to 120
3. **Gitignore generated images** — stop tracking binaries, regenerate on deploy
4. **Lazy loading** — add `loading="lazy"` to img tags

Expected result: dist drops from ~136 MB to ~25-35 MB, git repo sheds ~123 MB of binaries, page loads become faster.

## Netlify free tier context

- **Bandwidth:** 100 GB/month. At current 136 MB dist, a full-site crawl uses 0.14% of the limit. Not an immediate concern, but optimization provides headroom as the site grows.
- **Deploy size:** typically 1 GB limit. Current 136 MB is 14% — comfortable but worth watching if more budget years are added.
- **Build minutes:** 300/month. Adding image regeneration to the build would consume more minutes per deploy.
