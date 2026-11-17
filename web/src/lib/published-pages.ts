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

import { ABOUT_PATH } from './site.mjs';
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
 * Five-Year Forecast, Revenue Summary, Revenue Detail, Expenditure Summary and
 * Expenditures Detail. Grants (58) was cut at Public Source's fact-check as
 * "not very user friendly, probably not of huge public interest" (Rich's
 * factcheck sheet, row 13; Max, 2026-11-14).
 */
export const PUBLISHED_CITYWIDE_SECTIONS: readonly number[] = [3, 4, 6, 7, 8];

/**
 * Department sections without a page: the Department of Public Works parent (29),
 * which holds only prose about its four bureaus, each of which has its own page.
 * Cut as "extraneous" at the fact-check (row 47; Max, 2026-11-14).
 */
export const UNPUBLISHED_DEPARTMENT_SECTIONS: readonly number[] = [29];

/** The site map: every published page, listed for readers and for Public Source's fact-check (Max, 2026-11-17). */
export const SITEMAP_PATH = '/sitemap/';
export const SITEMAP_TITLE = 'Site map';

/** A published page that isn't a budget section, with the name it is listed under on the site map. */
export interface SinglePage {
  path: string;
  title: string;
}

/** The headline site's pages that aren't a section: overviews, tools and reference pages. */
export const PUBLISHED_SINGLE_PAGES: readonly SinglePage[] = [
  { path: '/', title: 'Home' },
  { path: '/brief/', title: 'Budget in brief' },
  { path: '/operating/', title: 'Operating budget' },
  { path: '/capital/', title: 'Capital budget' },
  { path: '/trust-funds/', title: 'Trust funds' },
  { path: '/flow/', title: 'Money flow' },
  { path: '/trends/', title: 'Trends' },
  { path: '/compare/', title: 'Compare departments' },
  { path: '/personnel/', title: 'Personnel' },
  { path: '/glossary/', title: 'Glossary' },
  { path: ABOUT_PATH, title: 'About' },
  { path: SITEMAP_PATH, title: SITEMAP_TITLE },
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
  if (UNPUBLISHED_DEPARTMENT_SECTIONS.includes(section.section_number)) return null;
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
  return [...PUBLISHED_SINGLE_PAGES.map((page) => page.path), ...sectionPaths];
}

/**
 * Frameable copies of three home-page pieces, for Public Source to embed in its
 * stories (Max, 2026-11-17). They repeat home-page figures and are kept out of
 * search engines, so they aren't among the pages readers browse or the site map.
 */
export const EMBED_PAGES = {
  budgetSummary: { path: '/embed/budget-summary/', title: 'Budget summary' },
  moneyFlow: { path: '/embed/money-flow/', title: 'Where the money flows' },
  topDepartments: { path: '/embed/top-departments/', title: 'Top departments by budget' },
} as const;
