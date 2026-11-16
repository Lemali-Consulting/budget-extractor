/**
 * A department's headline change and budget trend chart must stay readable
 * when the prior year's budget is near zero. Public Source's fact-check
 * (Rich's factcheck sheet "1126", row 42): "In the 'Budget trend' [...] chart,
 * because spending was nearly zero this year, it's displaying very strangely."
 * The Office of Community Health and Safety's 2026 budget was $58,000 (its
 * positions sat in the Stop the Violence Trust Fund) against $4.1M in 2027,
 * a change of +7027.3%.
 */
import { test, expect } from "./test-base";
import { headlineChange } from "../src/lib/budget-change";
import { CHART_COLORS } from "../src/lib/chart-colors";

const OCHS = "/departments/office-of-community-health-and-safety/";

test("an ordinary change is headlined as a percentage, the dollars beneath", () => {
  expect(headlineChange({ current: 111_700_000, prior: 108_100_000 })).toEqual({ value: "+3.3%", detail: "$3.6M", isIncrease: true });
  expect(headlineChange({ current: 90, prior: 100 })).toEqual({ value: "-10.0%", detail: "$10", isIncrease: false });
});

test("a change from a near-zero year is headlined in dollars, since the percentage only says the prior year was small", () => {
  expect(headlineChange({ current: 4_133_821, prior: 58_000 })).toEqual({ value: "+$4.1M", detail: "from $58K", isIncrease: true });
});

test("a department with no prior budget gets a dollar headline, not a percentage", () => {
  expect(headlineChange({ current: 500_000, prior: 0 }).value).toBe("+$500K");
});

test("the Community Health and Safety headline isn't a five-figure percentage", async ({ page }) => {
  await page.goto(OCHS);
  const hero = page.locator("main .bg-ps-blue-50").first();
  await expect(hero).not.toContainText("7027");
  await expect(hero).toContainText("+$4.1M");
  await expect(hero).toContainText("from $58K");
});

test("the budget trend labels a small year in thousands and says why it was small", async ({ page }) => {
  await page.goto(OCHS);
  const chart = page.locator("div", { has: page.locator("h2", { hasText: /^Budget trend$/ }) }).last();
  await expect(chart.locator("svg").first()).toBeVisible();
  await expect(chart).toContainText("$58K");
  await expect(chart).not.toContainText("$0.1M");
  await expect(chart).toContainText("positions moved from the Stop the Violence Trust Fund");
});

test("the budget trend draws the budget year's bar in the primary color", async ({ page }) => {
  await page.goto("/departments/bureau-of-fire/");
  const chart = page.locator("div", { has: page.locator("h2", { hasText: /^Budget trend$/ }) }).last();
  // The chart draws once its script loads; wait for that rather than read an empty chart.
  await expect(chart.locator(`svg rect[fill="${CHART_COLORS.primary}"]`)).toHaveCount(1);
});
