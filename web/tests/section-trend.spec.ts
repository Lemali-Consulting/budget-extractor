/**
 * A department's budget trend chart draws one line per spending category or
 * line item across the PDF's year columns. The PDF prints a dash where a line
 * had no money that year, and the chart read the dash as a gap, so a line
 * funded in only one year became a lone dot with nothing to compare it to.
 * Max noticed this on the Office of Community Health and Safety page
 * (2026-11-16): salaries (51) and benefits (52) appeared as two dots on 2027
 * and nothing in 2025 or 2026, though the PDF shows those years as dashes
 * (no money) and its increase column counts the whole 2027 amount as new.
 */
import { test, expect } from "./test-base";
import { trendPoints } from "../src/lib/section-trend";

const YEAR_COLUMNS = [
  { idx: 1, year: 2025 },
  { idx: 2, year: 2026 },
  { idx: 3, year: 2027 },
];

test("a dash in the PDF is charted as zero, so a newly funded line rises from nothing", () => {
  const points = trendPoints({
    rows: [["51 - PERSONNEL-SALARIES & WAGES", "—", "—", "3,117,231"]],
    rowLabels: ["Personnel: salaries and wages"],
    yearColumns: YEAR_COLUMNS,
  });
  expect(points).toEqual([
    { label: "Personnel: salaries and wages", year: 2025, value: 0 },
    { label: "Personnel: salaries and wages", year: 2026, value: 0 },
    { label: "Personnel: salaries and wages", year: 2027, value: 3117231 },
  ]);
});

test("a line whose money stopped falls to zero instead of leaving a lone earlier dot", () => {
  const points = trendPoints({
    rows: [["54501 - Land & Buildings", "30,000", "—", "—"]],
    rowLabels: ["Land and buildings"],
    yearColumns: YEAR_COLUMNS,
  });
  expect(points.map((p) => p.value)).toEqual([30000, 0, 0]);
});

test("an empty cell is still a gap, and totals are left out of the chart", () => {
  const points = trendPoints({
    rows: [
      ["56 - SUPPLIES", "19,030", "", "50,000"],
      ["Expenditures Total", "812,819", "58,000", "4,133,821"],
    ],
    rowLabels: ["Supplies", "Expenditures total"],
    yearColumns: YEAR_COLUMNS,
  });
  expect(points).toEqual([
    { label: "Supplies", year: 2025, value: 19030 },
    { label: "Supplies", year: 2027, value: 50000 },
  ]);
});
