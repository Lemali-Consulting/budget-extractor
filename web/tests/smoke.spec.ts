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
  await expect(header.getByRole("link", { name: "Stories", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Explore", exact: true })).toBeVisible();

  // Headline is the 2027 proposed budget; amendment callout is 2026-only.
  await expect(main(page).getByText(/2027 Proposed/).first()).toBeVisible();
  await expect(main(page).locator('a[href="/amendments/"]')).toHaveCount(0);
  // Archive entry point
  await expect(page.locator('a[href="/2026/operating/"]').first()).toBeAttached();
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
    "Revenue Detail",
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
// Dashboard / Charts
// ---------------------------------------------------------------------------
test("dashboard page renders summary stats", async ({ page }) => {
  await page.goto("/dashboard/");

  await expect(main(page).locator("h1").first()).toContainText(
    /Dashboard/i,
  );
  // Should display budget figures (dollar amounts)
  await expect(main(page).getByText(/\$/).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// Data Explorer
// ---------------------------------------------------------------------------
test("data explorer loads", async ({ page }) => {
  await page.goto("/explorer/");

  // Title is rendered by the Preact DataExplorer component
  await expect(page).toHaveTitle(/Data Explorer/);
});

// ---------------------------------------------------------------------------
// Personnel
// ---------------------------------------------------------------------------
test("personnel page loads", async ({ page }) => {
  await page.goto("/personnel/");

  await expect(main(page).locator("h1").first()).toContainText(/Personnel/i);
});

// ---------------------------------------------------------------------------
// What Changed
// ---------------------------------------------------------------------------
test("changes page loads with budget figures", async ({ page }) => {
  await page.goto("/changes/");

  await expect(main(page).locator("h1").first()).toContainText(
    /What Changed/i,
  );
  await expect(main(page).getByText(/\$/).first()).toBeVisible();
});

test("changes page shows structure changes", async ({ page }) => {
  await page.goto("/changes/");

  await expect(
    main(page).getByText(/Departments.*Offices Added or Removed/i),
  ).toBeVisible();
  await expect(main(page).getByText(/Reorganized/i)).toBeVisible();
  await expect(main(page).getByText(/Office of Equity/)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Amendments (adopted vs amended)
// ---------------------------------------------------------------------------
test("amendments page loads with adopted-vs-amended figures", async ({ page }) => {
  await page.goto("/amendments/");

  await expect(main(page).locator("h1").first()).toContainText(/Amendment/i);
  await expect(main(page).getByText(/Adopted.*Dec 2025/i).first()).toBeVisible();
  await expect(main(page).getByText(/Amended.*Apr 2026/i).first()).toBeVisible();
  await expect(main(page).getByText(/Legislative Changes/i)).toBeVisible();
});

test("2026 archive operating page shows the amended-budget notice", async ({ page }) => {
  await page.goto("/2026/operating/");
  await expect(main(page).getByText(/as amended/i).first()).toBeVisible();
});

test("headline operating page has no amended-budget notice", async ({ page }) => {
  await page.goto("/operating/");
  await expect(main(page).getByText(/as amended/i)).toHaveCount(0);
});

test("amended cells are highlighted with adopted-vs-amended tooltips", async ({ page }) => {
  // HR was reorganized by the amendment, so its tables have highlighted cells.
  await page.goto("/2026/sections/department-of-human-resources-and-civil-service/");

  const cell = main(page)
    .locator("td.has-amendment-up, td.has-amendment-down")
    .first();
  await expect(cell).toBeVisible();
  await expect(cell).toHaveAttribute(
    "data-amendment-tip",
    /Adopted \(Dec 2025\).*Amended \(Apr 2026\)/,
  );

  // Hovering shows the shared floating tooltip (escapes table overflow clipping).
  await cell.hover();
  await expect(page.locator("#amendment-tooltip")).toBeVisible();
});

test("changed pages offer an adopted/amended source-image toggle", async ({ page }) => {
  // Bureau of Police has amended pages, so its source-page links carry the badge.
  await page.goto("/2026/sections/bureau-of-police/");

  const sourceBtn = main(page)
    .getByRole("button", { name: /View source page/i })
    .filter({ hasText: /amended/i })
    .first();
  await expect(sourceBtn).toBeVisible();
  await sourceBtn.click();

  // Lightbox opens on the amended page with an Amended/Adopted toggle.
  const adoptedToggle = page.getByRole("button", { name: /Adopted.*Dec 2025/ });
  await expect(adoptedToggle).toBeVisible();
  const img = page.locator('img[alt^="PDF page"]');
  await expect(img).toHaveAttribute("src", /\/pages\/2026\/bureau-of-police\//);

  // Toggling to Adopted swaps in the pre-amendment image.
  await adoptedToggle.click();
  await expect(img).toHaveAttribute("src", /\/pages-adopted\/2026\/bureau-of-police\//);
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

for (const route of ["/", "/operating/", "/sections/revenue-detail/", "/capital/", "/changes/", "/departments/bureau-of-police/", "/personnel/"]) {
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
  await expect(main(page).getByText(/FY2027 Proposed Operating Budget/).first()).toBeVisible();

  await page.goto("/capital/");
  await expect(main(page).getByText(/FY2027 Proposed Capital Budget/).first()).toBeVisible();

  await page.goto("/changes/");
  await expect(main(page).getByText(/2027 Proposed vs 2026 Budget/).first()).toBeVisible();
  await expect(main(page).getByText(/2027 vs 2026 adopted/i)).toHaveCount(0);

  await page.goto("/sections/revenue-detail/");
  await expect(main(page).getByText(/2027/).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2026 archive
// ---------------------------------------------------------------------------
const ARCHIVE_ROUTES: { route: string; current: string; heading: RegExp }[] = [
  { route: "/2026/operating/", current: "/operating/", heading: /Operating Budget/i },
  { route: "/2026/sections/revenue-detail/", current: "/sections/revenue-detail/", heading: /Revenue Detail/i },
  { route: "/2026/departments/", current: "/departments/", heading: /Department/i },
  { route: "/2026/departments/bureau-of-police/", current: "/departments/bureau-of-police/", heading: /Bureau of Police/i },
  { route: "/2026/capital/", current: "/capital/", heading: /Capital Budget/i },
  { route: "/2026/capital/28th-street-bridge-tip/", current: "/capital/28th-street-bridge-tip/", heading: /28TH STREET BRIDGE/i },
  { route: "/2026/changes/", current: "/changes/", heading: /What Changed/i },
  { route: "/2026/personnel/", current: "/personnel/", heading: /Personnel/i },
];

for (const { route, current, heading } of ARCHIVE_ROUTES) {
  test(`archive ${route} renders with the archive notice`, async ({ page }) => {
    await page.goto(route);
    await expect(main(page).locator("h1").first()).toContainText(heading);

    const notice = page.locator(ARCHIVE_NOTICE).first();
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/You.re viewing the 2026 budget/i);
    await expect(notice.locator(`a[href="${current}"]`)).toBeVisible();
    await expect(page.locator(PROPOSED_NOTICE)).toHaveCount(0);

    // Internal budget-content links stay inside the archive.
    const leaks = main(page).locator(
      'a[href^="/sections/"], a[href^="/departments/"], a[href^="/capital/"]',
    );
    await expect(leaks).toHaveCount(0);
  });
}

test("archive section page uses 2026 labels and images", async ({ page }) => {
  await page.goto("/2026/sections/bureau-of-police/");
  await expect(main(page).getByText(/2026 Budget/).first()).toBeVisible();
  await page.goto("/2026/capital/");
  await expect(main(page).getByText(/FY2026 Capital Budget/).first()).toBeVisible();
});

test("archive changes page compares 2026 with 2025", async ({ page }) => {
  await page.goto("/2026/changes/");
  await expect(main(page).getByText(/2026 Budget vs 2025/).first()).toBeVisible();
});

test("archive chart bars link inside the archive", async ({ page }) => {
  await page.goto("/2026/changes/");
  const bar = main(page).locator("#increases rect[data-slug]").first();
  await expect(bar).toBeVisible({ timeout: 10_000 });
  const slug = await bar.getAttribute("data-slug");
  await bar.click();
  await expect(page).toHaveURL(new RegExp(`/2026/sections/${slug}/`));
});

// ---------------------------------------------------------------------------
// Cross-year (pinned to 2025 proposed vs the 2026 document)
// ---------------------------------------------------------------------------
test("cross-year page renders and links into the 2026 archive", async ({ page }) => {
  await page.goto("/cross-year/");
  await expect(main(page).locator("h1").first()).toBeVisible();
  await expect(main(page).getByText(/2025 Proposed/).first()).toBeVisible();
  await expect(main(page).locator('a[href^="/2026/sections/"]').first()).toBeAttached();
  await expect(main(page).locator('a[href^="/sections/"]')).toHaveCount(0);
});

test("stories and amendments link into the 2026 archive", async ({ page }) => {
  await page.goto("/amendments/");
  await expect(main(page).locator('a[href^="/2026/sections/"]').first()).toBeAttached();
  await expect(main(page).locator('a[href^="/sections/"]')).toHaveCount(0);
});

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
  const routes = ["/", "/operating/", "/capital/", "/dashboard/", "/glossary/"];
  for (const route of routes) {
    await page.goto(route);
    const header = page.locator("header");
    await expect(
      header.getByRole("link", { name: /Budgets/i }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Stories", exact: true }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Explore", exact: true }),
    ).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Clickable chart bars
// ---------------------------------------------------------------------------
test("changes chart bars link to section pages", async ({ page }) => {
  await page.goto("/changes/");

  // Wait for chart SVG to render and bars to get data-slug attributes (set after hydration)
  const bar = main(page).locator("#increases rect[data-slug]").first();
  await expect(bar).toBeVisible({ timeout: 10_000 });
  await expect(bar).toHaveCSS("cursor", "pointer");

  // Click a bar and verify navigation to a section page
  const slug = await bar.getAttribute("data-slug");
  await bar.click();
  await expect(page).toHaveURL(new RegExp(`/sections/${slug}/`));
});

test("dashboard personnel chart bars link to section pages", async ({ page }) => {
  await page.goto("/dashboard/");

  // Scroll to personnel section heading, then find a bar with data-slug
  // that belongs to the personnel treemap (not the budget chart above)
  await main(page).getByText("Staffing Distribution").scrollIntoViewIfNeeded();

  // The budget chart bars also have data-slug; personnel bars follow them.
  // Use the 16th+ data-slug rect (budget chart has 15 bars max).
  const allSlugBars = main(page).locator("rect[data-slug]");
  const count = await allSlugBars.count();
  const bar = allSlugBars.nth(count > 15 ? 15 : 0);
  await expect(bar).toBeVisible({ timeout: 10_000 });
  await expect(bar).toHaveCSS("cursor", "pointer");

  const slug = await bar.getAttribute("data-slug");
  await bar.click({ force: true });
  await expect(page).toHaveURL(new RegExp(`/sections/${slug}/`));
});

test("dashboard budget chart bars link to section pages", async ({ page }) => {
  await page.goto("/dashboard/");

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
// Stories
// ---------------------------------------------------------------------------
test("stories index lists stories", async ({ page }) => {
  await page.goto("/stories/");

  await expect(main(page).locator("h1").first()).toContainText(/Stories/i);
  const cards = main(page).locator("a[href*='/stories/']");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThanOrEqual(4);
});

test("story page renders with content", async ({ page }) => {
  await page.goto("/stories/biggest-budget-shifts/");

  await expect(page).toHaveTitle(/Budget Shifts/i);
  await expect(
    page.locator("article h1").first(),
  ).toContainText(/Budget Shifts/i);
  // Should have narrative paragraphs
  await expect(page.locator("article p").first()).toBeVisible();
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
  await page.goto("/embed/budget-increases/");

  // Should not have the main site header
  await expect(page.locator("header nav")).not.toBeVisible();
  // Should have a source attribution
  await expect(
    page.getByText(/Pittsburgh Budget Explorer/i).first(),
  ).toBeVisible();
});

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
    "/dashboard/",
    "/personnel/",
    "/changes/",
    "/amendments/",
    "/glossary/",
    "/brief/",
    "/departments/",
    "/stories/",
    "/embed/",
    "/flow/",
    "/2026/operating/",
    "/2026/changes/",
    "/2026/personnel/",
    "/cross-year/",
  ];
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
  }

  expect(errors, "No JS errors on any page").toEqual([]);
});
