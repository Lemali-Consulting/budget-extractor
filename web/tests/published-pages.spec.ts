/**
 * Which pages the public site publishes, and that nothing links outside them.
 *
 * Public Source asked for 50 or fewer public pages so each can be edited and
 * fact-checked (Rich via Max, 2026-11-12). The list below is the spec: adding
 * a page means adding it here on purpose. See
 * docs/plans/2026-11-12-pare-site-to-43-pages.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(WEB_ROOT, "dist");

const SINGLE_PAGES = [
  "/", "/operating/", "/capital/", "/about/", "/trust-funds/",
  "/brief/", "/trends/", "/glossary/", "/personnel/", "/flow/",
  // Cut with the first pass, then brought back (Max, 2026-11-12).
  "/explorer/", "/compare/",
];

/** PDF sections 9–36: every department, bureau, office and board, the Public Works parent included. */
const DEPARTMENT_SLUGS = [
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
const CITYWIDE_SECTION_SLUGS = [
  "five-year-financial-forecast", "revenue-summary", "revenue-detail", "expenditure-summary", "expenditures-detail",
  "grants",
];

const PUBLISHED = new Set([
  ...SINGLE_PAGES,
  ...DEPARTMENT_SLUGS.map((s) => `/departments/${s}/`),
  ...CITYWIDE_SECTION_SLUGS.map((s) => `/sections/${s}/`),
]);

/** Every directory in the build that holds a page, as a site path. 404.html is the error page, not a page. */
function builtPages(dir = DIST, path = "/"): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "index.html") found.push(path);
    else if (statSync(full).isDirectory() && !name.startsWith("_") && !name.startsWith("pagefind")) {
      found.push(...builtPages(full, `${path}${name}/`));
    }
  }
  return found;
}

/** A site path a link points at, without its fragment or query; null for files and other sites. */
function pagePath(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const path = href.split(/[?#]/)[0];
  if (/\.[a-z0-9]+$/i.test(path)) return null; // images, data files
  return path.endsWith("/") ? path : `${path}/`;
}

test("the site publishes exactly the 46 agreed pages", () => {
  expect(PUBLISHED.size).toBe(46);
  expect(builtPages().sort()).toEqual([...PUBLISHED].sort());
});

test("no published page links to a page that isn't published", async ({ page }) => {
  const broken: string[] = [];
  for (const route of PUBLISHED) {
    await page.goto(route);
    const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    for (const href of hrefs) {
      const target = pagePath(href);
      if (target && !PUBLISHED.has(target)) broken.push(`${route} → ${href}`);
    }
  }
  expect([...new Set(broken)]).toEqual([]);
});

test("a department page shows the summary above the PDF section's tables", async ({ page }) => {
  await page.goto("/departments/bureau-of-fire/");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { name: "Top expenditures" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Top positions by budget" })).toBeVisible();
  // The PDF section's reproduced tables follow, each anchored for sharing.
  await expect(main.locator('[id^="table-"]').first()).toBeAttached();
  const summaryTop = await main.getByRole("heading", { name: "Top expenditures" }).boundingBox();
  const firstTableTop = await main.locator('[id^="table-"]').first().boundingBox();
  expect(summaryTop!.y).toBeLessThan(firstTableTop!.y);
});

test("the data explorer's section links lead only to published pages", async ({ page }) => {
  // The explorer lists every table, capital ones included, but only some sections have a page.
  await page.goto("/explorer/");
  await page.waitForLoadState("networkidle");
  const sidebarLinks = page.locator('a[aria-label^="View "]');
  expect(await sidebarLinks.count()).toBeGreaterThan(0);
  const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  const broken = hrefs.map(pagePath).filter((p): p is string => p !== null && !PUBLISHED.has(p));
  expect([...new Set(broken)]).toEqual([]);
});

test("the compare page links each department to its department page", async ({ page }) => {
  await page.goto("/compare/");
  await page.waitForLoadState("networkidle");
  const hrefs = await page.locator("main a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  const broken = hrefs.map(pagePath).filter((p): p is string => p !== null && !PUBLISHED.has(p));
  expect([...new Set(broken)]).toEqual([]);
});

test("the Department of Public Works parent section has its own department page", async ({ page }) => {
  await page.goto("/departments/department-of-public-works/");
  await expect(page.locator("main h1")).toContainText("Department of Public Works");
});

test("old links to a department's section page redirect to its department page", () => {
  // Netlify applies these; the local preview server ignores the file.
  const rules = readFileSync(join(WEB_ROOT, "public", "_redirects"), "utf8")
    .split("\n").map((l) => l.trim().split(/\s+/));
  for (const slug of DEPARTMENT_SLUGS) {
    expect(rules, slug).toContainEqual([`/sections/${slug}/`, `/departments/${slug}/`, "301"]);
  }
});

test("old links to a capital project page redirect to the capital index", () => {
  // Netlify won't apply "/capital/*  /capital/" because the target matches its
  // own pattern (old project links 404'd on the preview), so each project needs its own rule.
  const capital = JSON.parse(readFileSync(join(WEB_ROOT, "src", "data", "capital-budget-data.json"), "utf8"));
  const rules = readFileSync(join(WEB_ROOT, "public", "_redirects"), "utf8")
    .split("\n").map((l) => l.trim().split(/\s+/));
  expect(capital.sections.length).toBeGreaterThan(10);
  for (const { slug } of capital.sections) {
    expect(rules, slug).toContainEqual([`/capital/${slug}/`, "/capital/", "301"]);
  }
});

/**
 * Dates follow AP style everywhere the site shows them, the city's own text
 * reproduced from the PDF included (Max, 2026-11-12): Jan., Feb., Aug., Sept.,
 * Oct., Nov. and Dec. abbreviated with a day; March through July spelled out;
 * no ordinals ("July 4th"); no numeric dates ("11/25/26"). Reads the built
 * HTML whole, so the data explorer's embedded tables are checked too.
 */
const NON_AP_DATE = new RegExp(
  [
    String.raw`\b\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})\b`,
    String.raw`\b(?:Jan|Feb|Aug|Sept?|Oct|Nov|Dec) \d{1,2}\b`,
    String.raw`\b(?:Mar|Apr|Jun|Jul)\.? \d{1,2}\b`,
    String.raw`\b(?:January|February|August|September|October|November|December) \d{1,2}\b`,
    String.raw`\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.|Feb\.|Aug\.|Sept\.|Oct\.|Nov\.|Dec\.) \d{1,2}(?:st|nd|rd|th)\b`,
  ].join("|"),
  "g",
);

test("published pages write dates in AP style", () => {
  const offenders: string[] = [];
  for (const path of PUBLISHED) {
    const html = readFileSync(join(DIST, path, "index.html"), "utf8").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    for (const match of html.match(NON_AP_DATE) ?? []) offenders.push(`${path}: ${match}`);
  }
  expect([...new Set(offenders)]).toEqual([]);
});

const AP_DATE_EXAMPLES: [string, string][] = [
  ["/departments/bureau-of-administration-public-safety/", "From Sept. 1, 2025 - Sept. 1, 2026"],
  ["/departments/department-of-mobility-and-infrastructure/", "pave up to Nov. 25, 2026"],
  ["/departments/bureau-of-fire/", "Jan. 1, 2010"],
  ["/departments/bureau-of-police/", "expired on Dec. 31, 2025"],
  ["/departments/bureau-of-animal-care-and-control/", "Feb. 19"],
  ["/departments/department-of-parks-and-recreation/", "July 4"],
  ["/sections/grants/", "as of Nov. 1, 2026"],
];

for (const [path, text] of AP_DATE_EXAMPLES) {
  test(`${path} shows "${text}"`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("main")).toContainText(text);
  });
}
