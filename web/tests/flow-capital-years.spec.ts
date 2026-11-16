/**
 * The capital flow covers the years the capital plan itself totals: 2027-2032,
 * $802,209,722 on p. 24 of the capital budget PDF. It used to add 2026 as
 * well, but the 2027 document details 2026 money only for projects still
 * funded later, so its 2026 column came out $2.26M under p. 24's 2026 row
 * (Rich's factcheck sheet "1126", row 7, column G). Max chose to drop 2026
 * (2026-11-16).
 */
import { test, expect } from "./test-base";

test("the capital flow covers 2027-2032 and totals what the plan totals", async ({ page }) => {
  await page.goto("/flow/");
  const capital = page.locator("section", { has: page.getByRole("heading", { name: /^Capital plan/ }) });
  await expect(capital.locator("h2 + span")).toHaveText("2027–2032 · $802.2M");
  const svg = capital.locator("svg");
  await expect(svg.locator("text", { hasText: /^2032$/ })).toHaveCount(1);
  await expect(svg.locator("text", { hasText: /^2026$/ })).toHaveCount(0);
  await expect(capital).toContainText("out across 6 fiscal years");
});
