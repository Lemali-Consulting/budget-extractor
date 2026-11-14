/**
 * Which operating sections the public site publishes, and where each one's page lives.
 *
 * Public Source asked for 50 or fewer pages so each can be fact-checked
 * (docs/plans/2026-11-12-pare-site-to-43-pages.md). The headline site publishes
 * one merged page per department under /departments/ and a few citywide
 * sections under /sections/; trust funds and the remaining sections appear
 * only as rows on the overview pages, unlinked. Archive years, when published,
 * keep every section page.
 */

import type { BudgetYear } from './budget-year';


/** Section numbers in the 2027 proposed budget document. */
interface SectionRange {
  first: number;
  last: number;
}

/** Every department, bureau, office and board, the Department of Public Works parent included. */
export const DEPARTMENT_SECTIONS: SectionRange = { first: 9, last: 36 };
export const TRUST_FUND_SECTIONS: SectionRange = { first: 37, last: 56 };
/**
 * Five-Year Forecast, Revenue Summary, Revenue Detail, Expenditure Summary,
 * Expenditures Detail, and Grants (58). Provisional: Max is deciding which
 * citywide sections stay (2026-11-12). Grants was cut with the reference
 * sections, then brought back as the only list of each grant (Max, 2026-11-12).
 */
export const PUBLISHED_CITYWIDE_SECTIONS: readonly number[] = [3, 4, 6, 7, 8, 58];

/** The headline site's pages that aren't a section: overviews, tools and reference pages. */
export const PUBLISHED_SINGLE_PAGES: readonly string[] = [
  '/', '/operating/', '/capital/', '/about/', '/trust-funds/',
  '/brief/', '/trends/', '/glossary/', '/personnel/', '/flow/',
  '/compare/',
];

interface SectionRef {
  section_number: number;
  slug: string;
  title: string;
}

function inRange(section: SectionRef, range: SectionRange): boolean {
  return section.section_number >= range.first && section.section_number <= range.last;
}

export function isDepartmentSection(section: SectionRef): boolean {
  return inRange(section, DEPARTMENT_SECTIONS);
}

export function isTrustFundSection(section: SectionRef): boolean {
  return inRange(section, TRUST_FUND_SECTIONS);
}

/** The page a section is published at, or null when the site doesn't publish it. */
export function sectionPageHref(opts: { budgetYear: BudgetYear; section: SectionRef }): string | null {
  const { budgetYear, section } = opts;
  if (!budgetYear.isHeadline) return `${budgetYear.routePrefix}/sections/${section.slug}/`;
  if (isDepartmentSection(section)) return `/departments/${section.slug}/`;
  if (PUBLISHED_CITYWIDE_SECTIONS.includes(section.section_number)) return `/sections/${section.slug}/`;
  return null;
}

/** The operating sections the year publishes a page for, in document order. */
export function publishedSections(budgetYear: BudgetYear): any[] {
  return budgetYear.operating.sections.filter((section: SectionRef) => sectionPageHref({ budgetYear, section }) !== null);
}

/**
 * Slug → page for every published section. Islands take this instead of the
 * section list, and show a name as plain text when its slug is missing.
 */
export function publishedSectionHrefs(budgetYear: BudgetYear): Record<string, string> {
  const hrefs: Record<string, string> = {};
  for (const section of budgetYear.operating.sections as SectionRef[]) {
    const href = sectionPageHref({ budgetYear, section });
    if (href) hrefs[section.slug] = href;
  }
  return hrefs;
}

/** Every page the year publishes, as site paths: the single pages, then its sections in document order. */
export function publishedPagePaths(budgetYear: BudgetYear): string[] {
  const sectionPaths = publishedSections(budgetYear).map((section: SectionRef) => sectionPageHref({ budgetYear, section }) as string);
  return [...PUBLISHED_SINGLE_PAGES, ...sectionPaths];
}
