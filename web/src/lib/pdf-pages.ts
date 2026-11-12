/**
 * Pages of the budget PDF the site leaves out. Each section opens with a
 * cover page, its name printed over the city seal, which only repeats the
 * page's own title (Rich via Max, 2026-11-12).
 */

/** The chart type the extractor gives the city seal. */
export const SEAL_CHART_TYPE = 'logo';

/** A cover's name runs to a few short lines ("Department of / Parks and / Recreation"); a paragraph is longer. */
const MAX_COVER_TITLE_CHARS = 60;

interface PdfPage {
  relative_page: number;
  text_blocks?: { text: string }[];
  chart_regions?: { chart_type: string }[];
}

function isShortTitle(text: string): boolean {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= MAX_COVER_TITLE_CHARS && !/[.;:]$/.test(flat);
}

/** A page holding only the seal and a short name, with no table. */
export function isCoverPage(opts: { page: PdfPage; tablePages: ReadonlySet<number> }): boolean {
  const { page, tablePages } = opts;
  const charts = page.chart_regions ?? [];
  if (tablePages.has(page.relative_page)) return false;
  if (charts.length === 0 || charts.some((c) => c.chart_type !== SEAL_CHART_TYPE)) return false;
  return (page.text_blocks ?? []).every((b) => isShortTitle(b.text));
}
