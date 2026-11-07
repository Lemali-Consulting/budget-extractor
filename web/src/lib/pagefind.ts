/** Shared Pagefind settings: where the index is served and how indexed pages are marked up. */

/** URL of the Pagefind runtime that `pagefind --site dist` writes into the build. */
export const PAGEFIND_PATH = '/pagefind/pagefind.js';

/** Budget types shown as a badge on search results (Pagefind metadata values). */
export const PAGEFIND_BUDGET_TYPE = {
  OPERATING: 'Operating',
  CAPITAL: 'Capital',
} as const;
export type PagefindBudgetType = (typeof PAGEFIND_BUDGET_TYPE)[keyof typeof PAGEFIND_BUDGET_TYPE];

/**
 * Attributes that opt a page into the full-text index. Only headline-year pages are
 * indexed, so archive routes rendering the same components get no attributes.
 */
export function pagefindBodyAttrs(opts: {
  isHeadline: boolean;
  budgetType: PagefindBudgetType;
}): Record<string, string> {
  if (!opts.isHeadline) return {};
  return {
    'data-pagefind-body': '',
    'data-pagefind-meta': `budgetType:${opts.budgetType}`,
  };
}
