/**
 * Marks on department pages a reader can't decode (Rich's factcheck sheet
 * "1126", row 16, on the Bureau of Fire page "and presumably all of the
 * department/bureau pages").
 */
import { test, expect } from "./test-base";
import { positionTitle } from "../src/lib/personnel";

test("a position's title drops the PDF's footnote asterisk", () => {
  // The PDF marks a title split between funds ("Director*") or with a note on its pay rate ("Battalion Chief *",
  // promoted after Jan. 1, 2010). The site shows splits under the title, and the rate note isn't in its summaries.
  expect(positionTitle("Battalion Chief *")).toBe("Battalion Chief");
  expect(positionTitle("Director*")).toBe("Director");
  expect(positionTitle("Fire Chief")).toBe("Fire Chief");
});

test("the budget trend says which year is actual spending", async ({ page }) => {
  // Item 1: "Does the asterix by 2025 [...] indicate that is an actual, rather than budgeted, figure? If so, can we indicate that?"
  await page.goto("/departments/bureau-of-fire/");
  const chart = page.locator("div", { has: page.locator("h2", { hasText: /^Budget trend$/ }) }).last();
  await expect(chart.locator("svg").first()).toBeVisible();
  await expect(chart).toContainText("2025 actual");
  await expect(chart).toContainText("2027 budget");
  await expect(chart).not.toContainText("*");
});

test("the top positions table shows no unexplained asterisks", async ({ page }) => {
  // Item 2: "What do the asterixes by positions in the 'Top positions' table mean? Can we either explain or remove those?"
  // The reproduced PDF tables keep the PDF's marks; Fire's prints its note on the same page.
  const summaries = [
    ["/departments/bureau-of-fire/", "Top positions by budget"],
    ["/departments/department-of-finance/", "Top positions by budget"],
  ] as const;
  for (const [path, heading] of summaries) {
    await page.goto(path);
    const table = page.locator("div", { has: page.locator("h2", { hasText: heading }) }).last().locator("table");
    const titles = await table.locator("tbody tr td:first-child").allTextContents();
    expect(titles.length, path).toBeGreaterThan(0);
    expect(titles.filter((t) => t.includes("*")), path).toEqual([]);
  }
  // The personnel page lists every position, so no PDF table shares it.
  await page.goto("/personnel/");
  const titles = await page.locator("table tbody tr td:first-child").allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  expect(titles.filter((t) => t.includes("*"))).toEqual([]);
});

test("the page list says its page numbers are the operating budget PDF's", async ({ page }) => {
  // Item 3: "In the 'On this page' box, I presume the pages at the left are operating budget pages. [...] can we make that clear to the reader?"
  await page.goto("/departments/bureau-of-fire/");
  const toc = page.locator("details", { has: page.locator("summary", { hasText: "On this page" }) });
  await expect(toc).toContainText("Page numbers are from the proposed 2027 operating budget PDF.");
});
