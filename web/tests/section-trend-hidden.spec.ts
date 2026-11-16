/**
 * Before 2027, the Office of Community Health and Safety's staff were paid
 * from the Stop the Violence Trust Fund (operating budget PDF, p. 191), so
 * the office's own financial summary prints dashes for salaries and benefits
 * in 2025 and 2026. Charted line by line, that history reads as an office
 * with no staff until 2027. Max chose to drop the line-item trend from that
 * page only (2026-11-16); the summary's total-budget trend, which carries a
 * note about the move, stays, as does the category breakdown.
 */
import { test, expect } from "./test-base";

const chartTabs = (page: import("@playwright/test").Page) =>
  page.locator("main").getByRole("tab", { name: /^(Budget trend|Breakdown)$/ });

test("the Office of Community Health and Safety page has no line-item budget trend", async ({ page }) => {
  await page.goto("/departments/office-of-community-health-and-safety/");
  await expect(chartTabs(page).filter({ hasText: "Breakdown" })).toHaveCount(1);
  await expect(chartTabs(page).filter({ hasText: "Budget trend" })).toHaveCount(0);
  await expect(page.locator("main")).toContainText("moved from the Stop the Violence Trust Fund");
});

test("other departments keep their line-item budget trend", async ({ page }) => {
  await page.goto("/departments/bureau-of-police/");
  await expect(chartTabs(page).filter({ hasText: "Budget trend" })).toHaveCount(1);
});
