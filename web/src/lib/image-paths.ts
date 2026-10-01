/**
 * Public URL builders for per-year source-page and chart images. Kept free of
 * data imports so Preact components can use it without bundling budget JSON.
 */

const PAGES_DIR = '/pages';
const ADOPTED_PAGES_DIR = '/pages-adopted';
const CHARTS_DIR = '/charts';

/** Rendered PDF page image for a section (relative page index, 0-based). */
export function pageImageUrl(opts: { year: number; slug: string; page: number }): string {
  return `${PAGES_DIR}/${opts.year}/${opts.slug}/P${opts.page}.webp`;
}

/** Pre-amendment ("adopted") PDF page image; only rendered for changed pages. */
export function adoptedPageImageUrl(opts: { year: number; slug: string; page: number }): string {
  return `${ADOPTED_PAGES_DIR}/${opts.year}/${opts.slug}/P${opts.page}.webp`;
}

/** Extracted chart/figure image for a section page. */
export function chartImageUrl(opts: {
  year: number;
  slug: string;
  page: number;
  chartIndex: number;
}): string {
  return `${CHARTS_DIR}/${opts.year}/${opts.slug}/P${opts.page}C${opts.chartIndex}.webp`;
}
