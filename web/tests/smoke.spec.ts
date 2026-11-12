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
  // Departments link to their merged department pages; the citywide sections
  // keep their section pages, and the trust funds share one overview.
  const departments = main(page).locator("#departments a[href^='/departments/']");
  expect(await departments.count()).toBe(28);
  expect(await main(page).locator("a[href^='/sections/']").count()).toBeGreaterThan(0);
  await expect(main(page).locator("a[href='/trust-funds/']")).toBeVisible();
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

// The Grants section is the only place the budget lists each grant with its
// funder and what has been spent; the personnel page's Grants fund links to it.
test("grants page lists each grant with its funder and balance", async ({ page }) => {
  await page.goto("/sections/grants/");
  await expect(main(page).locator("h1").first()).toContainText("Grants");
  await expect(main(page).locator("table").first()).toBeVisible();
  await expect(main(page).getByText("Diesel Vehicle Replacement").first()).toBeVisible();
  await expect(main(page).getByText(/remaining balance/i).first()).toBeVisible();
});

// Rich (Public Source) asked for a chart breaking tax revenue down by levy.
// The revenue summary is the section that prints each tax's 2027 figure, so
// the chart lives there, largest tax first, labeled in house style.
test("revenue summary charts 2027 tax revenue by tax, largest first", async ({ page }) => {
  await page.goto("/sections/revenue-summary/");
  const chart = main(page).getByTestId("tax-revenue-chart");
  await expect(chart).toBeVisible();
  await expect(chart.getByRole("heading")).toContainText(/2027 tax revenue by tax/i);
  const labels = await chart.getByTestId("tax-revenue-bar-label").allTextContents();
  expect(labels[0]).toBe("Real estate tax");
  expect(labels[1]).toBe("Earned income tax");
  expect(labels).toContain("Regional Asset District tax relief");
  // The table's total row ("41 - Tax Revenue") is not a tax.
  expect(labels.filter((l) => /^\d/.test(l))).toEqual([]);
  await expect(chart).toContainText("$171.4M");
  // Taxes budgeted at nothing get no bar; the note names them instead.
  expect(labels).not.toContain("Facility usage fee");
  await expect(chart.getByTestId("tax-revenue-note")).toHaveText(/^\s*Facility usage fee and other taxes have no revenue budgeted for 2027\./);
});

test("the tax revenue chart appears only on the revenue summary", async ({ page }) => {
  await page.goto("/sections/revenue-detail/");
  await expect(main(page).getByTestId("tax-revenue-chart")).toHaveCount(0);
});

test("operating section detail - department page", async ({ page }) => {
  await page.goto("/departments/city-council/");

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
  const cards = main(page).getByTestId("capital-project-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(10);
  // The site publishes no page per project (Public Source's 50-page limit), so the cards aren't links.
  await expect(main(page).locator("a[href^='/capital/']")).toHaveCount(0);
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

  // Each fund cites where it sits in the PDF. Fund names aren't links: the
  // site publishes no page per trust fund (Public Source's 50-page limit).
  const first = rows.first();
  await expect(first.locator("a[href^='/sections/']")).toHaveCount(0);
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
  await page.goto("/departments/department-of-human-resources-and-civil-service/");
  await expect(main(page).locator("table").first()).toBeVisible();
  await expect(main(page).locator("td.has-amendment-up, td.has-amendment-down")).toHaveCount(0);

  await page.goto("/departments/bureau-of-police/");
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
  "/departments/bureau-of-police/",
  "/sections/revenue-detail/",
  "/trust-funds/",
  "/personnel/",
  "/flow/",
  "/trends/",
  "/explorer/",
  "/compare/",
  "/glossary/",
  "/about/",
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

// Max, 2026-11-12: the compare page shows each department's total budget (it
// showed the cost of its positions, which didn't match the department page),
// drops FTE changes like the rest of the site, and lists departments only:
// "drop trust funds. They're not a department".
const COMPARE_PS_ADMIN = "/compare/?depts=Bureau%20of%20Administration%20(Public%20Safety),Bureau%20of%20Fire";

test("compare page shows each department's total budget, as its department page does", async ({ page }) => {
  await page.goto(COMPARE_PS_ADMIN);
  // $21,269,163 in the 2027 proposed budget; its positions cost $7.6M.
  const card = main(page).getByTestId("compare-card").filter({ hasText: "Bureau of Administration (Public Safety)" });
  await expect(card).toContainText("2027 budget: $21.3M");
  const table = main(page).locator("table");
  await expect(table.locator("tr", { hasText: "2027 budget" })).toContainText("$21.3M");
  await expect(main(page)).not.toContainText("$7.6M");
});

test("a shared compare link highlights the departments it shows", async ({ page }) => {
  // The selection came from the link before hydration, so the chips and the
  // change colors kept the default selection's markup.
  await page.goto(COMPARE_PS_ADMIN);
  const pressed = main(page).getByTestId("compare-chip").and(page.locator(".bg-ps-blue-600"));
  await expect(pressed).toHaveText(["Bureau of Administration (Public Safety)", "Bureau of Fire"]);
  const change = main(page).locator("tr", { hasText: "Budget change" }).locator("td").last();
  await expect(change).toContainText("+3.3%");
  await expect(change).toHaveClass(/text-green-600/);
});

test("compare page shows no FTE changes", async ({ page }) => {
  await page.goto(COMPARE_PS_ADMIN);
  await expect(main(page).getByTestId("compare-card").first()).toBeVisible();
  await expect(main(page)).not.toContainText(/FTE\s*change/i);
  await expect(main(page).getByTestId("compare-card").filter({ hasText: /\([+-]\d+\)/ })).toHaveCount(0);
  await expect(main(page)).not.toContainText(/year-over-year/i);
});

// The count was of lines in the PDF's position table, allowances included,
// so Fire showed "Positions: 12" beside 679 FTE. FTE already gives the
// headcount, so the count was removed (Max, 2026-11-12).
test("compare page shows FTE but no count of position lines", async ({ page }) => {
  await page.goto(COMPARE_PS_ADMIN);
  await expect(main(page).getByTestId("compare-card").first()).toContainText("FTE");
  await expect(main(page)).not.toContainText(/Positions:|Total positions/);
});

test("compare page offers departments only, not trust funds", async ({ page }) => {
  await page.goto("/compare/");
  const chips = main(page).getByTestId("compare-chip");
  // The 28 department sections, less the Public Works parent, which has no budget of its own.
  await expect(chips).toHaveCount(27);
  await expect(chips.filter({ hasText: /Trust Fund|^Grants$/ })).toHaveCount(0);
  // Each card's name links to the department page (its FTE label links to the glossary).
  for (const card of await main(page).getByTestId("compare-card").all()) {
    await expect(card.locator("a").first()).toHaveAttribute("href", /^\/departments\//);
  }
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

// The budget balances revenue plus a draw on the fund balance against
// spending. Rich (Public Source) asked for the draw, printed as "Use of Fund
// Balance" ($28,253,606) in the five-year forecast, to appear on the left.
// Rich (Public Source) asked for the operating total to read as the proposed
// budget in whole millions, the way readers will quote it (2026-11-12).
test("operating flow header names the proposed budget and its total in millions", async ({ page }) => {
  await page.goto("/flow/");
  const header = page.getByTestId("operating-flow-total");
  await expect(header).toHaveText("Proposed 2027 budget · $727M");
});

test("operating flow shows the use of fund balance as a source", async ({ page }) => {
  await page.goto("/flow/");
  const node = page.locator('rect[data-node-id="source:use-of-fund-balance"]');
  await expect(main(page).locator("svg text", { hasText: "Use of fund balance" })).toBeVisible();
  await node.hover();
  await expect(page.getByTestId("flow-tooltip")).toContainText("Use of fund balance: $28.3M");
});

// The PDF's printed draw ($28,253,606) is $301,302 less than its own totals
// imply. Max chose to show the printed figure without a note: the gap is too
// small to change how the diagram looks (2026-11-12).
test("operating flow shows the printed fund balance draw without a note on the gap", async ({ page }) => {
  await page.goto("/flow/");
  await expect(main(page)).not.toContainText("$301,302");
  await expect(main(page)).not.toContainText("$28,554,908");
});

// Each department shows its own budget, not one scaled to make the diagram
// balance: a figure the PDF doesn't print would fail fact-checking.
test("operating flow shows each department's own budget", async ({ page }) => {
  await page.goto("/flow/");
  await page.locator('rect[data-node-id="dep:bureau-of-police"]').hover();
  await expect(page.getByTestId("flow-tooltip")).toContainText("Bureau of Police: $128.2M");
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
// The tooltip counted lines in the PDF's position table, allowances
// included ("12 position types" for Fire's 10 titles). FTE already gives the
// headcount, so the count was removed, as on the compare page (Max, 2026-11-12).
test("personnel staffing chart tooltip shows FTE and budget but no position count", async ({ page }) => {
  await page.goto("/personnel/");
  const bar = main(page).locator("rect[data-slug]").first();
  await expect(bar).toBeVisible({ timeout: 10_000 });
  await bar.hover({ force: true });
  const tip = main(page).locator('[aria-label="tip"]');
  await expect(tip).toContainText(/FTE: \d+/);
  await expect(tip).toContainText(/Budget: \$[\d.]+M/);
  await expect(tip).not.toContainText("position types");
});

// Max, 2026-11-12: the chart's "Budget" is each department's total budget,
// as on its department page and the compare page, not what its positions cost
// (Police: $128.2M total, $76.0M in positions).
test("personnel staffing chart's budget is the department's total budget", async ({ page }) => {
  await page.goto("/personnel/");
  const police = main(page).locator('rect[data-slug="bureau-of-police"]');
  await expect(police).toBeVisible({ timeout: 10_000 });
  await police.hover({ force: true });
  await expect(main(page).locator('[aria-label="tip"]')).toContainText("Budget: $128.2M");
});

test("personnel staffing chart bars link to department pages", async ({ page }) => {
  await page.goto("/personnel/");
  // The chart redraws once after hydration, so rely on the auto-retrying
  // assertions and click rather than a one-shot scroll on a stale element.
  const bar = main(page).locator("rect[data-slug]").first();
  await expect(bar).toBeVisible({ timeout: 10_000 });
  await expect(bar).toHaveCSS("cursor", "pointer");

  const slug = await bar.getAttribute("data-slug");
  await bar.click({ force: true });
  await expect(page).toHaveURL(new RegExp(`/departments/${slug}/`));
});

test("home budget chart bars link to department pages", async ({ page }) => {
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
  await expect(page).toHaveURL(new RegExp(`/departments/${slug}/`));
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

// Rich (Public Source) asked for the six-year capital plan in millions rather
// than "$0.80B", which hid $2.2M of the $802.2M total (2026-11-12).
test("brief gives the six-year capital plan in millions", async ({ page }) => {
  await page.goto("/brief/");
  const body = main(page);
  await expect(body).not.toContainText(/\$\d+\.\d+B/);
  await expect(page.locator("#how-big")).toContainText("6-year plan: $802.2M");
  await expect(page.locator("#how-big")).toContainText("six-year, $802.2M plan");
  await expect(page.locator("#capital")).toContainText("$802.2M");
});

// The operating budget is revenue plus a planned draw on the fund balance;
// Rich asked for the draw in the revenue chart so it adds up to the budget.
test("brief revenue chart includes the use of fund balance and totals the budget", async ({ page }) => {
  await page.goto("/brief/");
  const section = page.locator("#revenue");
  await expect(section.locator("svg text", { hasText: "Use of fund balance" })).toBeVisible();
  await expect(section.locator("svg text", { hasText: "$28.3M" })).toBeVisible();
  // The bars sum to $727.0M: the printed draw is $301K short of what the
  // budget's own totals imply, a gap Max chose not to annotate (2026-11-12).
  await expect(section.locator("svg text", { hasText: /^Total$/ })).toBeVisible();
  await expect(section.locator("svg text", { hasText: "$727.0M" })).toBeVisible();
  await expect(section).toContainText("$28.3M from its fund balance");
  await expect(section).toContainText("projected revenue and its use of fund balance build up to the total");
  await expect(section).toContainText("$727M");
});

// Police is a bureau, not a department, so Rich asked for "unit".
test("brief calls the Bureau of Police the single largest unit", async ({ page }) => {
  await page.goto("/brief/");
  await expect(page.locator("#spending")).toContainText("The Bureau of Police alone is the single largest unit.");
});

test("brief capital prose opens on what the capital budget funds", async ({ page }) => {
  await page.goto("/brief/");
  await expect(page.locator("#capital")).not.toContainText("Beyond day-to-day operations");
  await expect(page.locator("#capital")).toContainText("The capital budget funds infrastructure");
});

// ---------------------------------------------------------------------------
// Department One-Pagers
// ---------------------------------------------------------------------------

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

for (const route of ["/brief/"]) {
  test(`${route} offers none of the retired change embeds`, async ({ page }) => {
    await page.goto(route);
    // Embed buttons carry their path in the island's props, not in a link.
    const html = await page.content();
    for (const embedPath of RETIRED_EMBED_PATHS) {
      expect(html).not.toContain(embedPath);
    }
  });
}

// The Brief's workforce section dropped its 2027-vs-2026 staffing comparison
// with the change embeds (client request, 2026-11-12); the total stays.
test("brief workforce section shows the total positions without a year-over-year comparison", async ({ page }) => {
  await page.goto("/brief/");
  const section = page.locator("#workforce");
  await expect(section).toContainText(/Total positions/i);
  await expect(section).not.toContainText(/year-over-year/i);
  await expect(section).not.toContainText(/FTE change/i);
  await expect(section).not.toContainText(/new positions/i);
  await expect(section).not.toContainText(/eliminated/i);
  await expect(section).not.toContainText(/net change/i);
  // The link-preview description shared to social media follows suit.
  await expect(page.locator('meta[property="og:description"]')).not.toHaveAttribute("content", /new positions/i);
});

// Department pages drop the inferred new / eliminated / shifted position
// lists (client request, 2026-11-12): they match job titles across departments
// and years, the department-by-department comparison retired elsewhere.
for (const route of [
  "/departments/department-of-mobility-and-infrastructure/",
  "/departments/department-of-innovation-and-performance/",
]) {
  test(`${route} lists no inferred position changes`, async ({ page }) => {
    await page.goto(route);
    await expect(main(page).getByRole("heading", { name: /Position changes/i })).toHaveCount(0);
    await expect(main(page)).not.toContainText(/New positions|Eliminated positions|Shifted (in|out)/i);
  });
}

// The PDF prints spending categories ("51 - Personnel-Salaries & Wages") with
// their own line items ("51101 - Regular") beneath them. Listing both counts
// the same dollars twice, so the department summary lists categories only.
test("department top expenditures list spending categories only, not their line items", async ({ page }) => {
  await page.goto("/departments/bureau-of-fire/");
  const card = main(page).locator("div.bg-white", {
    has: page.getByRole("heading", { name: "Top expenditures", exact: true }),
  });
  const labels = (await card.locator("span.truncate").allInnerTexts()).map((l) => l.trim());
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.filter((l) => !/^\d{2} - /.test(l))).toEqual([]);
  expect(labels[0]).toMatch(/^51 - /);
});

// FTE-change boxes are removed (client request, 2026-11-12): the 2027 FTE
// counts stay, but no page sets them against 2026 or lists new and
// eliminated positions.
test("department pages show staff counts without an FTE change box", async ({ page }) => {
  await page.goto("/departments/bureau-of-fire/");
  await expect(main(page).getByText("Staff (FTE)", { exact: true })).toBeVisible();
  await expect(main(page)).not.toContainText(/FTE change/i);
});

test("personnel page has no staffing-changes summary", async ({ page }) => {
  await page.goto("/personnel/");
  await expect(main(page).getByTestId("personnel-scope-note")).toBeVisible();
  await expect(main(page)).not.toContainText(/Staffing changes|Net FTE change|New positions|Eliminated positions/i);
  // The staffing chart used to color each bar by its 2026-to-2027 change.
  await expect(main(page).locator("figure svg, svg").first()).toBeVisible();
  await expect(main(page)).not.toContainText(/FTE change|Budget change|year-over-year/i);
});

test("department summaries show positions without an FTE change", async ({ page }) => {
  // This section printed "Positions (FTE) 43 ↑ NaN" while the change was shown.
  await page.goto("/departments/office-of-community-health-and-safety/");
  await expect(main(page)).toContainText(/Staff\s*\(\s*FTE\s*\)\s*43/);
  await expect(main(page)).not.toContainText(/\(\s*FTE\s*\)\s*[\d,.]+\s*[↑↓]/);
  await expect(main(page)).not.toContainText("NaN");
});

// Position lines show the budget per position (client request, 2026-11-12),
// so a reader doesn't divide the line total by the headcount. Lines with a
// fractional headcount are part-time or split between funds, where dividing
// would not give one position's budget, so they show a dash.
test("department top positions show the budget per position", async ({ page }) => {
  await page.goto("/departments/bureau-of-administration-public-safety/");
  const table = main(page).locator("table").filter({ hasText: "Per position" });
  await expect(table).toBeVisible();
  // 6 positions, $511,306 in the 2027 proposed budget.
  const row = table.locator("tr").filter({ hasText: "Violence Prevention Specialist" });
  await expect(row.locator("td").last()).toHaveText("$85K");
});

test("personnel explorer shows the budget per position, except on fractional lines", async ({ page }) => {
  await page.goto("/personnel/");
  const explorer = main(page).locator("table").filter({ hasText: "Per position" });
  await expect(explorer).toBeVisible();
  const filter = main(page).getByPlaceholder("Filter by title...");
  await filter.fill("Violence Prevention Specialist");
  const whole = explorer.locator("tbody tr").filter({ hasText: "Bureau of Administration (Public Safety)" });
  await expect(whole.locator("td").last()).toHaveText("$85,218");
  // 1.5 positions split 25%/75% with the Department of Finance.
  await filter.fill("Senior Assistant, Real Estate");
  const split = explorer.locator("tbody tr").filter({ hasText: "Three Taxing Bodies Trust Fund" });
  await expect(split.locator("td").last()).toHaveText("—");
});

// The explorer opens on the biggest position lines (client request,
// 2026-11-12) rather than alphabetically by department.
test("personnel explorer starts sorted by 2027 budget, largest first", async ({ page }) => {
  await page.goto("/personnel/");
  const explorer = main(page).locator("table").filter({ hasText: "Per position" });
  await expect(explorer.locator("th").filter({ hasText: "2027 budget" })).toContainText("↓");
  const budgets = (await explorer.locator("tbody tr td:nth-child(5)").allTextContents())
    .slice(0, 20)
    .map((t) => Number(t.replace(/[$,]/g, "")));
  expect(budgets.length).toBe(20);
  expect(budgets).toEqual([...budgets].sort((a, b) => b - a));
});

// Where the PDF splits a title's pay between funds, every line it covers says
// so (client request, 2026-11-12), starred or not: the PDF prints each split
// once and stars only some of the lines it covers. RAD's Senior Park Ranger
// line has no asterisk but is in the split.
const SENIOR_PARK_RANGER_SPLIT = "Pay split: 12% Public Safety Administration General Fund, 88% Parks RAD Trust Fund";

test("department top positions show the pay split on lines the PDF splits", async ({ page }) => {
  await page.goto("/personnel/");
  const explorer = main(page).locator("table").filter({ hasText: "Per position" });
  await main(page).getByPlaceholder("Filter by title...").fill("Senior Park Ranger");
  const row = explorer.locator("tbody tr").filter({ hasText: "Public Safety" }).filter({ hasText: "Senior Park Ranger" }).first();
  await expect(row).toContainText(SENIOR_PARK_RANGER_SPLIT);
  // Each fund links to its department page; trust funds have no page, so theirs is plain text.
  await expect(row.getByRole("link", { name: "Public Safety Administration General Fund" }))
    .toHaveAttribute("href", "/departments/bureau-of-administration-public-safety/");
  await expect(row.getByRole("link", { name: "Parks RAD Trust Fund" })).toHaveCount(0);
});

test("personnel explorer shows the pay split on every line the PDF splits, and only those", async ({ page }) => {
  await page.goto("/personnel/");
  const explorer = main(page).locator("table").filter({ hasText: "Per position" });
  await main(page).getByPlaceholder("Filter by title...").fill("Park Ranger");
  const rows = explorer.locator("tbody tr");
  await expect(rows.filter({ hasText: "Senior Park Ranger" })).toHaveCount(2);
  for (const row of await rows.filter({ hasText: "Senior Park Ranger" }).all()) {
    await expect(row).toContainText(SENIOR_PARK_RANGER_SPLIT);
  }
  await expect(rows.filter({ hasText: "Park Ranger, Part-Time" })).not.toContainText("Pay split");
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
    "/personnel/",
    "/glossary/",
    "/brief/",
    "/departments/bureau-of-police/",
    "/sections/revenue-detail/",
    "/trust-funds/",
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

test("the trust fund overview flags no correction on the Parks Tax Trust Fund", async ({ page }) => {
  // The fund's own section page isn't published (Public Source's 50-page limit),
  // so the overview is the only place a correction flag could appear.
  await page.goto("/trust-funds/");
  const row = main(page).getByTestId("trust-fund-row").filter({ hasText: "Parks Tax Trust Fund" });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("Corrected by us");
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

// The chart panel on section pages labels its series with the table's row
// names. Category names ("Charges for Services") follow house style, but
// department names are proper nouns, even printed short ("Parks and Recreation").
// Each bar's value is printed past its end; the longest bar's value must fit
// inside the chart rather than run off its right edge ("$98." for "$98.2M").
for (const route of ["/departments/bureau-of-police/", "/sections/expenditure-summary/"]) {
  test(`section chart bar values fit inside the chart on ${route}`, async ({ page }) => {
    await page.goto(route);
    const panel = main(page).getByTestId("section-charts");
    for (const tab of ["Breakdown"]) {
      await panel.getByRole("tab", { name: tab }).click();
      const svg = panel.locator("svg").last();
      await expect(svg.locator('g[aria-label="text"] text').first()).toBeAttached();
      const overflow = await svg.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return [...el.querySelectorAll('g[aria-label="text"] text')]
          .map((t) => t.getBoundingClientRect())
          .filter((r) => r.right > box.right + 0.5 || r.left < box.left - 0.5).length;
      });
      expect(overflow, `${tab} labels outside the chart`).toBe(0);
    }
  });
}

// The panel charts only the PDF's own figures. Its year-over-year tab plotted a
// row-by-row change the PDF doesn't print, so Max had it removed (2026-11-12).
test("section charts offer budget trend and breakdown, not a computed year-over-year change", async ({ page }) => {
  await page.goto("/departments/bureau-of-police/");
  const tabs = main(page).getByTestId("section-charts").getByRole("tab");
  await expect(tabs).toHaveText(["Budget trend", "Breakdown"]);
});

test("section chart labels follow house style", async ({ page }) => {
  await page.goto("/sections/revenue-summary/");
  const panel = main(page).getByTestId("section-charts");
  await expect(panel).toContainText("Charges for services");
  await expect(panel).not.toContainText("Charges for Services");
});

// Account rows open with their code; the name after it is what starts the label.
test("section chart labels capitalize the name after an account code", async ({ page }) => {
  await page.goto("/departments/bureau-of-police/");
  const panel = main(page).getByTestId("section-charts");
  await panel.getByRole("tab", { name: "Breakdown" }).click();
  await expect(panel).toContainText("51101 - Regular");
  await expect(panel).toContainText("51 - Personnel-salaries & wages");
});

test("section chart labels keep department names as printed", async ({ page }) => {
  await page.goto("/sections/expenditure-summary/");
  const panel = main(page).getByTestId("section-charts");
  await panel.getByRole("tab", { name: "Breakdown" }).click();
  await expect(panel).toContainText("Parks and Recreation");
  await expect(panel).not.toContainText("Parks and recreation");
});

test("department names keep their capitals", async ({ page }) => {
  await page.goto("/departments/bureau-of-police/");
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
  await page.goto("/capital/");
  const names = main(page).getByTestId("capital-project-name");
  await expect(names.filter({ hasText: /^\s*Street resurfacing\s*$/ })).toHaveCount(1);
  await expect(names.filter({ hasText: /^\s*28th Street Bridge \(TIP\)\s*$/ })).toHaveCount(1);
});

for (const capitalIndex of ["/capital/"]) {
  test(`${capitalIndex} lists no project in ALL CAPS`, async ({ page }) => {
    await page.goto(capitalIndex);
    const names = await main(page).getByTestId("capital-project-name").allInnerTexts();
    expect(names.length).toBeGreaterThan(10);
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

