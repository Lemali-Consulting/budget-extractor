/**
 * The chart panel on a department page plots the rows of the department's
 * financial summary. Public Source's fact-check (Rich's factcheck sheet
 * "1126", column G of rows 22, 32, 37, 39, 40 and 44) found a "Row" series
 * as big as the whole budget: the extractor lost the label of the summary's
 * total row, and the chart named the unlabelled row "Row". The same charts
 * plotted each spending category beside the line items it is made of, so
 * the same dollars appeared twice.
 */
import type { Locator } from "@playwright/test";
import { test, expect } from "./test-base";
import { chartedRows } from "../src/lib/chart-rows";

const FINANCE_ROWS = [
  ["Expenditures", "", "", "", "", ""],
  ["51 - PERSONNEL-SALARIES & WAGES", "1", "2", "3", "1", "50%"],
  ["51101 - Regular", "1", "2", "3", "1", ""],
  ["82 - DEBT SERVICE", "72,500,000", "78,311,662", "47,259,165", "(31,052,497)", "(39.7)%"],
  ["82103 - Principal", "54,420,000", "57,500,000", "25,260,000", "(32,240,000)", ""],
  ["", "191,380,843", "197,900,939", "160,015,622", "(37,885,318)", "(19.1)%"],
];

test("a row with no label is not charted, since nothing says what it is", () => {
  const rows = chartedRows([["Real Estate Tax", "1"], ["", "9"]]);
  expect(rows).toEqual([["Real Estate Tax", "1"]]);
});

test("where a table has spending categories, only the categories are charted, so no dollar counts twice", () => {
  const labels = chartedRows(FINANCE_ROWS).map((r) => r[0]);
  expect(labels).toEqual(["51 - PERSONNEL-SALARIES & WAGES", "82 - DEBT SERVICE"]);
});

test("a table without category rows charts every labelled row", () => {
  const rows = [["Parks and Recreation", "5"], ["Bureau of Police", "9"]];
  expect(chartedRows(rows)).toEqual(rows);
});

/** Each piece of text in the chart panel on its own: legend entries, axis labels, values. */
async function chartLabels(panel: Locator): Promise<string[]> {
  return panel.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? "").trim();
      if (t && n.parentElement?.tagName !== "STYLE") texts.push(t);
    }
    return texts;
  });
}

for (const slug of [
  "department-of-finance",
  "citizen-police-review-board",
  "department-of-innovation-and-performance",
  "department-of-mobility-and-infrastructure",
  "department-of-permits-licenses-and-inspections",
  "office-of-municipal-investigations",
]) {
  test(`${slug}'s charts have no "Row" series and no line items beside their categories`, async ({ page }) => {
    await page.goto(`/departments/${slug}/`);
    const panel = page.locator("main").getByTestId("section-charts");
    for (const tab of ["Budget trend", "Breakdown"]) {
      await panel.getByRole("tab", { name: tab }).click();
      await expect(panel.locator("svg").last()).toBeVisible();
      const labels = await chartLabels(panel);
      expect(labels.some((l) => /^5\d - /.test(l)), `${tab}: categories`).toBe(true);
      expect(labels, `${tab}: unlabelled row`).not.toContain("Row");
      expect(labels.filter((l) => /^\d{5} - /.test(l)), `${tab}: line items`).toEqual([]);
    }
  });
}
