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
  "/compare/",
  // A list of every page, linked from the footer, so Public Source can check the
  // site against its fact-check by eye (Max, 2026-11-17). Links only, no budget content.
  "/sitemap/",
];

/** PDF sections 9–36: every department, bureau, office and board, except the Public Works parent (see RETIRED_SECTION_PAGES). */
export const DEPARTMENT_SLUGS = [
  "city-council", "office-of-the-city-clerk", "office-of-the-mayor", "office-of-management-and-budget",
  "department-of-innovation-and-performance", "commission-on-human-relations", "office-of-the-city-controller",
  "department-of-finance", "department-of-law", "ethics-hearing-board", "office-of-municipal-investigations",
  "department-of-human-resources-and-civil-service", "department-of-city-planning",
  "department-of-permits-licenses-and-inspections", "bureau-of-administration-public-safety",
  "bureau-of-emergency-medical-services", "bureau-of-police", "bureau-of-fire", "bureau-of-animal-care-and-control",
  "office-of-community-health-and-safety", "bureau-of-administration-public-works",
  "bureau-of-operations", "bureau-of-environmental-services", "bureau-of-facilities",
  "department-of-parks-and-recreation", "department-of-mobility-and-infrastructure", "citizen-police-review-board",
];

/** The citywide sections kept (Max, 2026-11-12). Grants was cut at the fact-check (see RETIRED_SECTION_PAGES). */
export const CITYWIDE_SECTION_SLUGS = [
  "five-year-financial-forecast", "revenue-summary", "revenue-detail", "expenditure-summary", "expenditures-detail",
];

/**
 * Pages cut at Public Source's fact-check (Rich's factcheck sheet "1126", 2026-11-13; Max, 2026-11-14).
 * Old links to them go to the operating budget index.
 */
export const RETIRED_SECTION_PAGES = [
  // Row 13: "not very user friendly, probably not of huge public interest".
  "/sections/grants/",
  // Row 47: "extraneous". The parent section holds only prose about its bureaus, which have their own pages.
  "/departments/department-of-public-works/",
];

/**
 * The data explorer showed every table in both budgets, capital projects and
 * trust funds included, so one URL held far more than could be fact-checked.
 * Its charts also mixed headcounts and dollars. Culled at Rich's suggestion
 * (Max, 2026-11-14); department and section pages show the same tables.
 */
export const RETIRED_EXPLORER = "/explorer/";

export const PUBLISHED = new Set([
  ...SINGLE_PAGES,
  ...DEPARTMENT_SLUGS.map((s) => `/departments/${s}/`),
  ...CITYWIDE_SECTION_SLUGS.map((s) => `/sections/${s}/`),
]);
