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

/** The citywide sections kept while Max decides which stay ("see where we land", 2026-11-12). */
const CITYWIDE_SECTION_SLUGS = [
  "five-year-financial-forecast", "revenue-summary", "revenue-detail", "expenditure-summary", "expenditures-detail",
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

test("the site publishes exactly the 43 agreed pages", () => {
  expect(PUBLISHED.size).toBe(43);
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
