/**
 * Reproduced tables shade a figure blue when it rose from the year before and
 * red when it fell. Public Source's fact-check (Rich's factcheck sheet "1126",
 * columns G and J of rows 17, 18 and 21-46) found the shading wrong across the
 * five-year forecasts: each year was compared with the first year in the
 * table rather than the one before it, so Innovation and Performance's 2030
 * forecast, up from 2029, showed as a decrease, and the "% change from prior
 * year" row was shaded as if it were dollars.
 */
import { test, expect } from "./test-base";
import { changeShading, INCREASE, DECREASE, UNCHANGED } from "../src/lib/change-shading";

test("each year is compared with the year before it, not the first year in the table", () => {
  const shading = changeShading({
    headers: ["", "2027", "2028", "2029", "2030", "2031"],
    rows: [["Innovation and Performance", "26,451,530", "25,875,923", "24,125,160", "24,292,132", "24,479,451"]],
  });
  expect(shading[0]).toEqual([UNCHANGED, UNCHANGED, DECREASE, DECREASE, INCREASE, INCREASE]);
});

test("a figure that holds steady is not shaded", () => {
  const shading = changeShading({
    headers: ["", "2029", "2030"],
    rows: [["Transfer to PAYGO", "5,000,000", "5,000,000"]],
  });
  expect(shading[0]).toEqual([UNCHANGED, UNCHANGED, UNCHANGED]);
});

test("the first forecast year is compared with the budget year before it", () => {
  // The five-year forecast's revenue table: shading must start in 2028, as the
  // department table beside it does, not in 2029.
  const shading = changeShading({
    headers: ["REVENUES", "2026 Estimate", "2027 Budget", "2028 Forecast", "2029 Forecast"],
    rows: [["Tax revenue", "540", "563", "576", "570"]],
  });
  expect(shading[0]).toEqual([UNCHANGED, UNCHANGED, UNCHANGED, INCREASE, DECREASE]);
});

test("a budget is not shaded against an actual or an estimate, which measure different things", () => {
  const shading = changeShading({
    headers: ["", "2025 Actual", "2026 Budget", "2027 Budget", "Increase/ (Decrease)", "% Change"],
    rows: [["51 - PERSONNEL-SALARIES & WAGES", "2,703,853", "2,901,384", "3,081,436", "180,052", "6.2%"]],
  });
  expect(shading[0]).toEqual([UNCHANGED, UNCHANGED, UNCHANGED, INCREASE, UNCHANGED, UNCHANGED]);
});

test("positions compare FTEs with FTEs and budgets with budgets", () => {
  const shading = changeShading({
    headers: ["Title", "2026 FTE", "Rate/ Grade", "Hours/ Months", "2026 Budget", "2027 FTE", "Rate/ Grade", "Hours/ Months", "2027 Budget"],
    rows: [["Division Chief", "2", "121,243", "12", "242,486", "3", "124,883", "12", "374,649"]],
  });
  expect(shading[0][5]).toBe(INCREASE);
  expect(shading[0][8]).toBe(INCREASE);
  expect(shading[0].filter((c) => c !== UNCHANGED)).toHaveLength(2);
});

test("a percentage-change row is shaded by its sign, since each cell is already a change", () => {
  // 1.2% after 6.0% is still growth; comparing the two would call it a decrease.
  const shading = changeShading({
    headers: ["", "2027", "2028", "2029", "2030", "2031"],
    rows: [["% Change from Prior Year", "6.0%", "1.2%", "(0.4)%", "—%", "0.8%"]],
  });
  expect(shading[0]).toEqual([UNCHANGED, UNCHANGED, INCREASE, DECREASE, UNCHANGED, INCREASE]);
});

test("every year of the historical revenue table is compared with the year before", () => {
  const shading = changeShading({
    headers: ["", "2021 Actual", "2022 Actual", "2023 Actual", "2024 Actual", "2025 Actual", "CAGR*"],
    rows: [["Real Estate Tax", "151,540,925", "151,373,606", "159,327,540", "143,510,418", "145,474,580", "(1.0)%"]],
  });
  expect(shading[0]).toEqual([UNCHANGED, UNCHANGED, DECREASE, INCREASE, DECREASE, INCREASE, UNCHANGED]);
});

test("the five-year forecast shows Innovation and Performance's 2030 rise as an increase", async ({ page }) => {
  await page.goto("/sections/five-year-financial-forecast/");
  const row = page.locator("tr", { has: page.locator("td", { hasText: /^Innovation and Performance$/ }) }).first();
  const cells = row.locator("td");
  // Columns: label, 2025 actual, 2026 estimate, 2027 budget, 2028, 2029, 2030, 2031.
  await expect(cells.nth(5)).toHaveClass(/changed-decrease/);
  await expect(cells.nth(6)).toHaveClass(/changed-increase/);
  await expect(cells.nth(4)).toHaveClass(/changed-decrease/);
});

test("a department forecast's percentage row shows growth in blue", async ({ page }) => {
  await page.goto("/departments/city-council/");
  const row = page.locator("tr", { has: page.locator("td", { hasText: /^% Change from Prior Year$/i }) }).first();
  await expect(row.locator("td.changed-decrease")).toHaveCount(0);
  await expect(row.locator("td.changed-increase")).toHaveCount(4);
});
