/**
 * Smoke tests for the Pittsburgh Budget Explorer static site.
 * Verifies that all major routes render without errors and display expected content.
 */
import { test, expect, type Page } from "@playwright/test";

/** Scoped to <main> to avoid Astro dev toolbar elements. */
function main(page: Page) {
  return page.locator("main");
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
test("home page loads with key content", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Pittsburgh Budget Explorer/);
  await expect(main(page).locator("h1").first()).toContainText(
    "Pittsburgh Budget Explorer",
  );

  // Navigation dropdown triggers in header
  const header = page.locator("header");
  await expect(
    header.getByRole("link", { name: /Budgets/i }),
  ).toBeVisible();
  await expect(header.getByRole("link", { name: "Departments", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Explore", exact: true })).toBeVisible();

  await expect(main(page).getByText(/2027 proposed/).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Operating Budget Index
// ---------------------------------------------------------------------------
test("operating index lists sections", async ({ page }) => {
  await page.goto("/operating/");

  await expect(main(page).locator("h1").first()).toContainText(
    /Operating Budget/i,
  );
  // Should have multiple section cards
  const cards = main(page).locator("a[href*='/sections/']");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(10);
});

// ---------------------------------------------------------------------------
// Operating Section Detail (sample)
// ---------------------------------------------------------------------------
test("operating section detail renders tables", async ({ page }) => {
  await page.goto("/sections/revenue-detail/");

  await expect(main(page).locator("h1").first()).toContainText(
    "Revenue detail",
  );
  // Should have at least one table
  await expect(main(page).locator("table").first()).toBeVisible();
});

test("operating section detail - department page", async ({ page }) => {
  await page.goto("/sections/city-council/");

  await expect(main(page).locator("h1").first()).toContainText("City Council");
});

// ---------------------------------------------------------------------------
// Capital Budget Index
// ---------------------------------------------------------------------------
test("capital index lists projects", async ({ page }) => {
  await page.goto("/capital/");

  await expect(main(page).locator("h1").first()).toContainText(
    /Capital Budget/i,
  );
  const cards = main(page).locator("a[href*='/capital/']");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(10);
});

// ---------------------------------------------------------------------------
// Capital Project Detail (sample)
// ---------------------------------------------------------------------------
test("capital project detail renders", async ({ page }) => {
  await page.goto("/capital/28th-street-bridge-tip/");

  await expect(main(page).locator("h1").first()).toContainText(
    /28TH STREET BRIDGE/i,
  );
});

// ---------------------------------------------------------------------------
// Retired dashboard
// ---------------------------------------------------------------------------
// The dashboard repeated the home page's summary cards and charts, so it was
// cut at the client's request. Its charts live on the home page (budget by
// department), the personnel page (staffing), the brief (revenue)
// and the capital index (funding sources).
const RETIRED_DASHBOARD_HREF = "/dashboard/";

// Netlify redirects old /dashboard/ links to the home page (public/_redirects);
// the local preview server ignores that file, so the build itself must have no page.
test("the dashboard page is no longer built", async ({ page }) => {
  const response = await page.goto(RETIRED_DASHBOARD_HREF);
  expect(response?.status()).toBe(404);
});

for (const route of ["/", "/brief/", "/personnel/", "/operating/"]) {
  test(`${route} has no link to the retired dashboard`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator(`a[href^="${RETIRED_DASHBOARD_HREF}"]`)).toHaveCount(0);
  });
}

// ---------------------------------------------------------------------------
// Data Explorer
// ---------------------------------------------------------------------------
test("data explorer loads", async ({ page }) => {
  await page.goto("/explorer/");

  // Title is rendered by the Preact DataExplorer component
  await expect(page).toHaveTitle(/Data explorer/i);
});

// ---------------------------------------------------------------------------
// Personnel
// ---------------------------------------------------------------------------
test("personnel page loads", async ({ page }) => {
  await page.goto("/personnel/");

  await expect(main(page).locator("h1").first()).toContainText(/Personnel/i);
});

// ---------------------------------------------------------------------------
// Trust Funds breakdown
// ---------------------------------------------------------------------------
// The budget document never prints a combined trust-fund total, so the
// homepage figure is our sum. Fact-checkers (and readers) need
// the per-fund amounts behind it to verify it against the PDF.
for (const statsPage of ["/"]) {
  test(`${statsPage} trust-fund total links to a breakdown that adds up to it`, async ({ page }) => {
    await page.goto(statsPage);
    const card = main(page).getByTestId("trust-fund-total");
    const cardTotal = (await card.getByTestId("trust-fund-total-amount").innerText()).trim();

    await card.getByRole("link", { name: /See the funds/i }).click();
    await expect(page).toHaveURL(/\/trust-funds\/$/);

    await expect(main(page).locator("h1").first()).toContainText("Trust funds");
    await expect(main(page).getByTestId("trust-fund-sum")).toHaveText(cardTotal);
  });
}

test("trust-fund breakdown lists each fund with its source pages", async ({ page }) => {
  await page.goto("/trust-funds/");
  const rows = main(page).getByTestId("trust-fund-row");
  expect(await rows.count()).toBeGreaterThan(10);

  // Each fund links to its section page and cites where it sits in the PDF.
  const first = rows.first();
  await expect(first.locator("a[href^='/sections/']")).toBeVisible();
  await expect(first).toContainText(/p+\. \d+/);

  // The stated fund count matches the table.
  const count = await rows.count();
  await expect(main(page).getByTestId("trust-fund-count")).toHaveText(String(count));
});

// The payroll figure is the sum of each department's "Net Salaries" line
// (budgeted positions, part-time pay, less the vacancy allowance), which
// excludes overtime and includes trust-fund positions. Public Source's
// fact-check compared it to the $328.2M salaries-and-wages line, so the label
// must say what it covers rather than "payroll".
// The personnel card headlines the General Fund's printed salaries-and-wages
// line (overtime included) rather than a sum of our own, so a reader can find
// the same number on the cited page of the budget document.
// The card shows the headline figure and its label only.
test("/ personnel card shows only the salaries figure and its label", async ({ page }) => {
  await page.goto("/");
  const card = main(page).getByTestId("personnel-total");
  await expect(card.getByTestId("salaries-amount")).toBeVisible();
  await expect(card).toContainText(/General Fund salaries/i);
  await expect(card).not.toContainText(/includes overtime/i);
  await expect(card).not.toContainText(/FTE/);
});

// Department salary totals come from each position table's net-salaries line
// and so don't add up to the citywide salaries figure; the page must say why.
test("personnel page explains why department totals differ from the citywide salaries line", async ({ page }) => {
  await page.goto("/personnel/");
  const note = main(page).getByTestId("personnel-scope-note");
  await expect(note).toContainText(/net of vacancies/i);
  await expect(note).toContainText(/overtime/i);
});

// ---------------------------------------------------------------------------
// What Changed
// ---------------------------------------------------------------------------
// The 2027 page was retired at the client's request: functions moving between
// departments make a department-by-department comparison misleading.
const RETIRED_CHANGES_HREF = "/changes/";

test("the headline What Changed page is no longer published", async ({ page }) => {
  const response = await page.goto(RETIRED_CHANGES_HREF);
  expect(response?.status()).toBe(404);
});

for (const route of ["/", "/brief/", "/personnel/", "/operating/"]) {
  test(`headline ${route} has no link to the retired What Changed page`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator(`a[href^="${RETIRED_CHANGES_HREF}"]`)).toHaveCount(0);
  });
}

test("the brief drops its What changed this year section", async ({ page }) => {
  await page.goto("/brief/");
  await expect(page.locator("#changed")).toHaveCount(0);
  await expect(main(page).getByRole("heading", { name: /What changed this year/i })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// No amendment presentation on the 2027 pages
// ---------------------------------------------------------------------------
// The amended-budget notice names the amendment date ("as amended 4-20-26").
// Trust-fund descriptions also quote resolutions "as amended by ...", so the
// date is what tells the notice apart.
const AMENDED_NOTICE_TEXT = /as amended \d/i;

test("headline operating page has no amended-budget notice", async ({ page }) => {
  await page.goto("/operating/");
  await expect(main(page).getByText(AMENDED_NOTICE_TEXT)).toHaveCount(0);
});

test("headline section pages carry no amendment highlights or adopted toggle", async ({ page }) => {
  await page.goto("/sections/department-of-human-resources-and-civil-service/");
  await expect(main(page).locator("table").first()).toBeVisible();
  await expect(main(page).locator("td.has-amendment-up, td.has-amendment-down")).toHaveCount(0);

  await page.goto("/sections/bureau-of-police/");
  await expect(
    main(page).getByRole("button", { name: /View source page/i }).filter({ hasText: /amended/i }),
  ).toHaveCount(0);
  await main(page).getByRole("button", { name: /View image/i }).first().click();
  await expect(page.getByRole("button", { name: /Adopted.*Dec 2025/ })).toHaveCount(0);
  await expect(page.locator('img[alt^="PDF page"]')).toHaveAttribute(
    "src",
    /\/pages\/2027\/bureau-of-police\//,
  );
});

// ---------------------------------------------------------------------------
// 2027 proposed headline + notices
// ---------------------------------------------------------------------------
const PROPOSED_NOTICE = '[data-testid="proposed-notice"]';
const ARCHIVE_NOTICE = '[data-testid="archive-notice"]';

for (const route of ["/", "/operating/", "/sections/revenue-detail/", "/capital/", "/departments/bureau-of-police/", "/personnel/"]) {
  test(`headline ${route} shows the proposed-budget notice`, async ({ page }) => {
    await page.goto(route);
    const notice = page.locator(PROPOSED_NOTICE).first();
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/proposed 2027 budget/i);
    await expect(notice).toContainText(/City Council/);
    await expect(notice).toContainText(/December/);
    await expect(page.locator(ARCHIVE_NOTICE)).toHaveCount(0);
  });
}

test("headline pages are labeled 2027 Proposed", async ({ page }) => {
  await page.goto("/operating/");
  await expect(main(page).getByText(/FY2027 proposed operating budget/).first()).toBeVisible();

  await page.goto("/capital/");
  await expect(main(page).getByText(/FY2027 proposed capital budget/).first()).toBeVisible();

  await page.goto("/sections/revenue-detail/");
  await expect(main(page).getByText(/2027/).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Retired 2026 pages
// ---------------------------------------------------------------------------
// The site covers the 2027 proposed budget only (client request, 2026-11-12):
// the 2026 archive, the 2026 amendments page, the proposed-vs-adopted
// comparison and the stories (all written about 2026) are no longer published.
// Netlify redirects their old URLs (public/_redirects); the local preview
// server ignores that file, so the build itself must have no such pages.
const RETIRED_2026_ROUTES = [
  "/2026/operating/",
  "/2026/sections/revenue-detail/",
  "/2026/departments/",
  "/2026/departments/bureau-of-police/",
  "/2026/capital/",
  "/2026/capital/28th-street-bridge-tip/",
  "/2026/changes/",
  "/2026/personnel/",
  "/amendments/",
  "/cross-year/",
  "/stories/",
  "/stories/biggest-budget-shifts/",
  "/stories/capital-plan/",
  "/stories/city-workforce/",
  "/stories/where-your-tax-dollar-goes/",
];

for (const route of RETIRED_2026_ROUTES) {
  test(`retired ${route} is no longer built`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
  });
}

const RETIRED_HREF_SELECTOR =
  'a[href^="/2026/"], a[href^="/2025/"], a[href^="/amendments/"], a[href^="/cross-year/"], a[href^="/stories/"]';

for (const route of [
  "/",
  "/brief/",
  "/operating/",
  "/capital/",
  "/departments/",
  "/departments/bureau-of-police/",
  "/sections/bureau-of-police/",
  "/personnel/",
  "/flow/",
  "/trends/",
  "/compare/",
  "/glossary/",
  "/about/",
  "/embed/",
]) {
  test(`${route} links to no retired 2026 page`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator(RETIRED_HREF_SELECTOR)).toHaveCount(0);
  });
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------
test("compare page loads", async ({ page }) => {
  await page.goto("/compare/");

  await expect(main(page).locator("h1").first()).toContainText(/Compare/i);
});

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------
test("glossary page loads with terms", async ({ page }) => {
  await page.goto("/glossary/");

  await expect(main(page).locator("h1").first()).toContainText(/Glossary/i);
  // Should have section headings for term categories
  const headings = main(page).locator("h2, h3");
  expect(await headings.count()).toBeGreaterThan(5);
});

// ---------------------------------------------------------------------------
// Money Flow
// ---------------------------------------------------------------------------
test("flow page renders both sankey diagrams", async ({ page }) => {
  await page.goto("/flow/");

  await expect(main(page).locator("h1").first()).toContainText(/Money Flow/i);
  // Two sections, each with an SVG
  const svgs = main(page).locator("svg");
  expect(await svgs.count()).toBeGreaterThanOrEqual(2);
  // Sankey paths should be present (at least one per diagram)
  const paths = main(page).locator("svg path");
  expect(await paths.count()).toBeGreaterThan(10);
});

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------
test("about page loads", async ({ page }) => {
  await page.goto("/about/");

  await expect(main(page).locator("h1").first()).toContainText(/About/i);
});

// ---------------------------------------------------------------------------
// Navigation consistency
// ---------------------------------------------------------------------------
test("header navigation links are present on all pages", async ({ page }) => {
  const routes = ["/", "/operating/", "/capital/", "/personnel/", "/glossary/"];
  for (const route of routes) {
    await page.goto(route);
    const header = page.locator("header");
    await expect(
      header.getByRole("link", { name: /Budgets/i }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Departments", exact: true }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Explore", exact: true }),
    ).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Clickable chart bars
// ---------------------------------------------------------------------------
test("personnel staffing chart bars link to section pages", async ({ page }) => {
  await page.goto("/personnel/");
  const bar = main(page).locator("rect[data-slug]").first();
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible({ timeout: 10_000 });
  await expect(bar).toHaveCSS("cursor", "pointer");

  const slug = await bar.getAttribute("data-slug");
  await bar.click({ force: true });
  await expect(page).toHaveURL(new RegExp(`/sections/${slug}/`));
});

test("home budget chart bars link to section pages", async ({ page }) => {
  await page.goto("/");

  // Wait for the department comparison chart to render
  const chart = main(page).locator("[data-chart] svg").first();
  await expect(chart).toBeVisible({ timeout: 10_000 });

  // Bars should have cursor pointer and data-slug attributes
  const bar = chart.locator("rect[data-slug]").first();
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCSS("cursor", "pointer");

  // Click a bar and verify navigation
  const slug = await bar.getAttribute("data-slug");
  await bar.click();
  await expect(page).toHaveURL(new RegExp(`/sections/${slug}/`));
});

// ---------------------------------------------------------------------------
// Budget in Brief
// ---------------------------------------------------------------------------
test("brief page loads with hero stats", async ({ page }) => {
  await page.goto("/brief/");

  await expect(main(page).locator("h1").first()).toContainText(
    /Budget in Brief/i,
  );
  await expect(main(page).locator("strong").getByText(/per resident/i)).toBeVisible();
  await expect(main(page).getByText(/Where does the money go/i).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Department One-Pagers
// ---------------------------------------------------------------------------
test("departments index lists departments", async ({ page }) => {
  await page.goto("/departments/");

  await expect(main(page).locator("h1").first()).toContainText(
    /Department/i,
  );
  const cards = main(page).locator("a[href*='/departments/']");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(10);
});

test("department one-pager renders", async ({ page }) => {
  await page.goto("/departments/bureau-of-police/");

  await expect(main(page).locator("h1").first()).toContainText(
    /Bureau of Police/i,
  );
  await expect(main(page).locator("h2").getByText(/Budget Trend/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------
test("embed index lists available charts", async ({ page }) => {
  await page.goto("/embed/");

  await expect(main(page).locator("h1").first()).toContainText(
    /Embeddable Charts/i,
  );
  await expect(main(page).getByText(/iframe/i).first()).toBeVisible();
});

test("embed page renders chart without nav", async ({ page }) => {
  await page.goto("/embed/department-comparison/");

  // Should not have the main site header
  await expect(page.locator("header nav")).not.toBeVisible();
  // Should have a source attribution
  await expect(
    page.getByText(/Pittsburgh Budget Explorer/i).first(),
  ).toBeVisible();
});

// The department-by-department change embeds were retired with the What
// Changed page (client request, 2026-11-12): functions moving between
// departments make those comparisons read as policy change.
const RETIRED_EMBED_PATHS = ["/embed/budget-increases/", "/embed/budget-decreases/", "/embed/personnel-changes/"];

for (const embedPath of RETIRED_EMBED_PATHS) {
  test(`retired embed ${embedPath} is no longer built`, async ({ page }) => {
    const response = await page.goto(embedPath);
    expect(response?.status()).toBe(404);
  });
}

for (const route of ["/embed/", "/brief/"]) {
  test(`${route} offers none of the retired change embeds`, async ({ page }) => {
    await page.goto(route);
    // Embed buttons carry their path in the island's props, not in a link.
    const html = await page.content();
    for (const embedPath of RETIRED_EMBED_PATHS) {
      expect(html).not.toContain(embedPath);
    }
  });
}

// ---------------------------------------------------------------------------
// No console errors on key pages
// ---------------------------------------------------------------------------
test("no JS errors on key pages", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`${err.message}`));

  const routes = [
    "/",
    "/operating/",
    "/capital/",
    "/personnel/",
    "/glossary/",
    "/brief/",
    "/departments/",
    "/embed/",
    "/flow/",
    "/trends/",
  ];
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
  }

  expect(errors, "No JS errors on any page").toEqual([]);
});

// ---------------------------------------------------------------------------
// Trends (longitudinal headline figures)
// ---------------------------------------------------------------------------
test("trends page charts headline figures over time", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/trends/");
  await expect(page).toHaveTitle(/Trends/);
  await expect(main(page).locator("h1").first()).toContainText(/Trends/i);

  const chartHeadings = [
    "Recurring revenue",
    "Total expenditures",
    "Ending reserve fund balance",
  ];
  for (const name of chartHeadings) {
    const section = main(page).locator("section", {
      has: page.getByRole("heading", { name, level: 2 }),
    });
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator("svg").first()).toBeVisible();
    // Legend explains solid vs dashed
    await expect(section.getByText(/dashed/i).first()).toBeVisible();
  }

  // Revenue-by-category view renders a chart too
  const taxes = main(page).locator("section", {
    has: page.getByRole("heading", { name: /Revenue by category/i, level: 2 }),
  });
  await taxes.scrollIntoViewIfNeeded();
  await expect(taxes.locator("svg").first()).toBeVisible();

  // Callouts mention the headline year and are computed from data
  const callouts = main(page).locator('[data-testid="trend-callouts"]');
  await expect(callouts).toContainText(/2027 proposed/);
  await expect(callouts).toContainText(/\$\d/);

  // Notes block
  await expect(main(page).getByRole("heading", { name: "Notes", level: 2 })).toBeVisible();

  // The 2027 document's two different 2026 expenditure estimates are both stated, neutrally
  const notes = main(page).locator('[data-testid="trend-notes"]');
  const conflictNote = notes.locator("li", { hasText: /two different 2026 estimate figures/ });
  await expect(conflictNote).toContainText("$715.1M");
  await expect(conflictNote).toContainText("$715.0M");
  await expect(conflictNote).toContainText(/summary table/);
  await expect(conflictNote).toContainText(/department table/);
  await expect(conflictNote).toContainText(/The line uses the Five-Year Financial Forecast summary table/);

  // Nav link present (desktop dropdown)
  await expect(page.locator('header a[href="/trends/"]').first()).toBeAttached();
  // Home page link card
  await page.goto("/");
  await expect(main(page).locator('a[href="/trends/"]').first()).toBeVisible();

  expect(errors, "No console errors on /trends/").toEqual([]);
});

test("trends page has no horizontal scroll on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/trends/");
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// ---------------------------------------------------------------------------
// Source corrections (labelling errors in the PDF that we fix and disclose).
// The November 2027 Mayor's budget fixed the Parks Tax year labels that the
// September edition got wrong, so no document the site carries needs one; the
// pages must then say nothing was corrected rather than flag stale fixes.
// ---------------------------------------------------------------------------
const PARKS_TAX_2027_REVENUE = "9,209,226";

test("parks tax section shows the PDF's own year headings with no correction flags", async ({ page }) => {
  await page.goto("/sections/parks-tax-trust-fund/");

  await expect(main(page).locator('[data-testid="section-correction-notice"]')).toHaveCount(0);
  await expect(main(page).locator('[data-testid="table-correction-badge"]')).toHaveCount(0);

  const table = main(page).locator("table", { hasText: "41111 - Parks Tax" }).first();
  await expect(table.locator("th", { hasText: "2027 Budget" })).toBeVisible();
  await expect(table.getByText(PARKS_TAX_2027_REVENUE).first()).toBeVisible();
  await expect(table.locator("th", { hasText: "2025 Budget" })).toHaveCount(0);
});

test("about page says no corrections were made", async ({ page }) => {
  await page.goto("/about/#corrections");

  const section = main(page).locator("#corrections");
  await expect(section.getByRole("heading", { name: /Corrections we made/, level: 2 })).toBeVisible();
  await expect(section.locator('[data-testid="correction-entry"]')).toHaveCount(0);
  await expect(section.locator('[data-testid="no-corrections"]')).toContainText(
    /No corrections have been made to any of the budget documents/,
  );
});

test("home trust funds card shows figures without a correction footnote", async ({ page }) => {
  await page.goto("/");

  const card = main(page).locator("div", {
    has: page.getByText("Trust Funds", { exact: false }),
  }).filter({ hasText: "Separate from operating" }).last();
  await expect(card).not.toContainText("$0.0M");
  await expect(card).toContainText(/\$\d+\.\dM/);
  await expect(card.locator('[data-testid="trust-fund-correction-footnote"]')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Public Source branding (2025 brand guidelines)
// ---------------------------------------------------------------------------
// The site is presented with Pittsburgh's Public Source, so every page carries
// its logo and colors.
const PS_LOGO_ALT = "Pittsburgh's Public Source";
const PS_INK_RGB = "rgb(18, 18, 18)";
// Text links use the brand blue's text-safe shade (5.2:1 on white); PS Blue
// itself is 4.41:1, under the 4.5:1 minimum for body text.
const PS_LINK_BLUE_RGB = "rgb(4, 107, 209)";
const BRANDED_ROUTES = ["/", "/operating/", "/trends/"];

for (const route of BRANDED_ROUTES) {
  test(`${route} header carries the Public Source logo on brand ink`, async ({ page }) => {
    await page.goto(route);
    const header = page.locator("header").first();
    await expect(header.getByRole("img", { name: PS_LOGO_ALT })).toBeVisible();
    await expect(header).toHaveCSS("background-color", PS_INK_RGB);
  });
}

test("body links use the Public Source blue", async ({ page }) => {
  await page.goto("/");
  await expect(main(page).getByRole("link", { name: "How this was built" })).toHaveCSS("color", PS_LINK_BLUE_RGB);
});

// Public Source's brand fonts (Mallory Condensed, Calluna Sans) are licensed
// for desktop use only, which forbids styling live web text with them. Live
// text uses free, self-hosted lookalikes; the real faces appear only inside
// fixed-size images such as the header wordmark.
const HEADLINE_FONT = "Fira Sans Extra Condensed";
const BODY_FONT = "Alegreya Sans";

function primaryFamily(fontFamily: string): string {
  return fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
}

for (const route of BRANDED_ROUTES) {
  test(`${route} sets headlines and body text in the brand lookalike fonts`, async ({ page }) => {
    await page.goto(route);
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      const h1 = document.querySelector("h1, h2") as HTMLElement;
      return {
        heading: getComputedStyle(h1).fontFamily,
        body: getComputedStyle(document.body).fontFamily,
        loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")),
      };
    });
    expect(primaryFamily(fonts.heading)).toBe(HEADLINE_FONT);
    expect(primaryFamily(fonts.body)).toBe(BODY_FONT);
    // Served from this site, so the faces load with no third-party request.
    expect(fonts.loaded).toEqual(expect.arrayContaining([HEADLINE_FONT, BODY_FONT]));
  });
}

test("embedded charts use the brand body font", async ({ page }) => {
  // Embeds load in other sites' pages, so they carry their own font loading.
  await page.goto("/embed/revenue-breakdown/");
  const body = await page.evaluate(async () => {
    await document.fonts.ready;
    return getComputedStyle(document.body).fontFamily;
  });
  expect(primaryFamily(body)).toBe(BODY_FONT);
});

test("the site requests no fonts from Google", async ({ page }) => {
  const googleFontRequests: string[] = [];
  page.on("request", (req) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) googleFontRequests.push(req.url());
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  expect(googleFontRequests).toEqual([]);
});

test("header wordmark is an image of the brand headline face, with a text alternative", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header").first().getByRole("img", { name: "Budget Explorer" })).toBeVisible();
});

// ---------------------------------------------------------------------------
// House style: sentence case
// ---------------------------------------------------------------------------
// Public Source capitalizes only the first word and proper nouns. Section
// names taken from the budget PDF follow that style; department and fund
// names are proper nouns and stay as printed.
test("PDF section names are shown in sentence case", async ({ page }) => {
  await page.goto("/sections/expenditure-summary/");
  await expect(main(page).locator("h1").first()).toHaveText(/^\s*Expenditure summary\s*$/);
});

test("department names keep their capitals", async ({ page }) => {
  await page.goto("/sections/bureau-of-police/");
  await expect(main(page).locator("h1").first()).toContainText("Bureau of Police");
});

test("revenue categories on the money flow page are sentence case", async ({ page }) => {
  await page.goto("/flow/");
  await expect(main(page)).toContainText("Charges for services");
  await expect(main(page)).not.toContainText("Charges For Services");
});

test("budget chart year picker labels follow sentence case", async ({ page }) => {
  await page.goto("/");
  const options = main(page).locator("select option");
  await expect(options.filter({ hasText: /^\d{4} budget$/ }).first()).toBeAttached();
  await expect(options.filter({ hasText: /^\d{4} Budget$/ })).toHaveCount(0);
});

test("glossary 'used in' links show section names in sentence case", async ({ page }) => {
  await page.goto("/glossary/");
  await expect(main(page).getByRole("link", { name: "Revenue detail", exact: true }).first()).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Revenue Detail", exact: true })).toHaveCount(0);
});

// Capital project names are printed in ALL CAPS. Each has a hand-written
// sentence-case name (named bridges and streets keep their capitals); a new
// project missing from that list would show up in ALL CAPS here.
test("capital project names are sentence case, keeping place names", async ({ page }) => {
  await page.goto("/capital/street-resurfacing/");
  await expect(main(page).locator("h1").first()).toHaveText(/^\s*Street resurfacing\s*$/);
  await page.goto("/capital/28th-street-bridge-tip/");
  await expect(main(page).locator("h1").first()).toHaveText(/^\s*28th Street Bridge \(TIP\)\s*$/);
});

for (const capitalIndex of ["/capital/"]) {
  test(`${capitalIndex} lists no project in ALL CAPS`, async ({ page }) => {
    await page.goto(capitalIndex);
    const names = await main(page).locator('a[href*="/capital/"]').allInnerTexts();
    const shouting = names.map((n) => n.trim()).filter((n) => /[A-Z]{4,}/.test(n.replace(/\b(CDBG|HSIP|AIDS|HOME)\b|\([A-Z]+\)/g, "")));
    expect(shouting).toEqual([]);
  });
}

test("reproduced table column headers follow house style", async ({ page }) => {
  await page.goto("/sections/expenditure-summary/");
  const headers = main(page).locator("table thead th");
  await expect(headers.filter({ hasText: /^\s*2027 budget\s*$/ }).first()).toBeAttached();
  await expect(headers.filter({ hasText: /2027 Budget/ })).toHaveCount(0);
});

test("capital project metadata chips follow house style", async ({ page }) => {
  await page.goto("/capital/penn-avenue-reconstruction-phase-ii-tip/");
  await expect(main(page)).toContainText("Continuing, capital project");
  await expect(main(page)).toContainText("Engineering and construction");
});
