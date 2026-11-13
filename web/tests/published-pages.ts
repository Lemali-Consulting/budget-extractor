/**
 * The pages the public site publishes — the spec, written out by hand.
 *
 * Public Source asked for 50 or fewer public pages so each can be edited and
 * fact-checked (Rich via Max, 2026-11-12). Adding a page means adding it here
 * on purpose. See docs/plans/2026-11-12-pare-site-to-43-pages.md.
 */

export const SINGLE_PAGES = [
  "/", "/operating/", "/capital/", "/about/", "/trust-funds/",
  "/brief/", "/trends/", "/glossary/", "/personnel/", "/flow/",
  // Cut with the first pass, then brought back (Max, 2026-11-12).
  "/explorer/", "/compare/",
];

/** PDF sections 9–36: every department, bureau, office and board, the Public Works parent included. */
export const DEPARTMENT_SLUGS = [
  "city-council", "office-of-the-city-clerk", "office-of-the-mayor", "office-of-management-and-budget",
  "department-of-innovation-and-performance", "commission-on-human-relations", "office-of-the-city-controller",
  "department-of-finance", "department-of-law", "ethics-hearing-board", "office-of-municipal-investigations",
  "department-of-human-resources-and-civil-service", "department-of-city-planning",
  "department-of-permits-licenses-and-inspections", "bureau-of-administration-public-safety",
  "bureau-of-emergency-medical-services", "bureau-of-police", "bureau-of-fire", "bureau-of-animal-care-and-control",
  "office-of-community-health-and-safety", "department-of-public-works", "bureau-of-administration-public-works",
  "bureau-of-operations", "bureau-of-environmental-services", "bureau-of-facilities",
  "department-of-parks-and-recreation", "department-of-mobility-and-infrastructure", "citizen-police-review-board",
];

/**
 * The citywide sections kept while Max decides which stay ("see where we land", 2026-11-12).
 * Grants was cut with the reference sections, then brought back because it is
 * the only place the site lists each grant (Max, 2026-11-12).
 */
export const CITYWIDE_SECTION_SLUGS = [
  "five-year-financial-forecast", "revenue-summary", "revenue-detail", "expenditure-summary", "expenditures-detail",
  "grants",
];

export const PUBLISHED = new Set([
  ...SINGLE_PAGES,
  ...DEPARTMENT_SLUGS.map((s) => `/departments/${s}/`),
  ...CITYWIDE_SECTION_SLUGS.map((s) => `/sections/${s}/`),
]);
