/**
 * Headings reproduced from the budget PDF follow house style: sentence case,
 * with department, bureau, office and fund names keeping their capitals
 * (Rich via Max, 2026-11-12). Text the extractor mistook for a heading (chart
 * axis values, pie-slice labels, notes) is not shown as one.
 */
import { test, expect } from "./test-base";
import { classifyPdfHeading, isPdfChartScrap, pdfHeadingText, subclassLabel, tableGroupLabel } from "../src/lib/pdf-headings";

const FIRE = { pdfTitle: "Bureau of Fire", title: "Bureau of Fire" };
const CLERK = { pdfTitle: "Office of the\nCity Clerk", title: "Office of the City Clerk" };
const GUIDE = { pdfTitle: "Budget Guide", title: "Budget guide" };

const headingOf = (text: string, section = FIRE) => classifyPdfHeading({ text, section });

test.describe("PDF table and chart titles become sentence-case headings", () => {
  const cases: [string, string, typeof FIRE?][] = [
    ["Position Summary", "Position summary"],
    ["Subclass Detail", "Subclass detail"],
    ["Revenue Account Summary", "Revenue account summary"],
    ["Temporary, Part-Time, and Seasonal Allowances", "Temporary, part-time, and seasonal allowances"],
    ["Historical Revenue", "Historical revenue"],
    // The section's own name takes its display title.
    ["Budget Guide", "Budget guide", GUIDE],
    ["Office of the\nCity Clerk", "Office of the City Clerk", CLERK],
    // A department name printed in capitals above a chart title gets ordinary capitals.
    ["BUREAU OF FIRE\n2027 Expenditures by Subclass", "Bureau of Fire 2027 expenditures by subclass"],
    ["ETHICS HEARING BOARD\n2027 Expenditures by Subclass", "Ethics Hearing Board 2027 expenditures by subclass"],
    ["Office of the City Clerk\n2027 Expenditures by Subclass", "Office of the City Clerk 2027 expenditures by subclass", CLERK],
    // Other names keep their capitals.
    ["Department of\nPublic Safety", "Department of Public Safety"],
    ["Special Revenue\nFunds", "Special revenue funds"],
    ["Five Year Forecast", "Five year forecast"],
    // After "Position summary:" comes a grant's own name.
    ["Position Summary: Head of Talent Acquisition\n2129400555", "Position summary: Head of Talent Acquisition 2129400555"],
    // A bond series letter is a designator, not a word.
    ["Refunding Series B of 2020 (Federally Taxable)\nAnnual", "Refunding series B of 2020 (federally taxable) annual"],
    // A chart title loses the axis value printed under it.
    ["Major Tax Revenue Growth, 2027 to 2031\n$800,000,000", "Major tax revenue growth, 2027 to 2031"],
    ["Select Major Expenditures, 2020-2026\n150,000,000", "Select major expenditures, 2020-2026"],
  ];
  for (const [text, expected, section] of cases) {
    test(`${JSON.stringify(text)} → ${expected}`, () => {
      expect(headingOf(text, section)).toEqual({ kind: "heading", text: expected });
    });
  }
});

test.describe("chart values and labels are not headings", () => {
  const scraps = [
    "$100,000,000",
    "$",
    "$0\n2027 2028 2029 2030 2031",
    "$160,015,622: 22.0%",
    "12.8%\n26.7%",
    "Tax Revenue: 80.6%",
    "Non-Tax\nRevenue: 19.4%",
    "Personnel: $542,163,861",
    "Earned Income Tax\n20.7%",
    "Debt Service\n$800,000,000 20.0%",
    // A pie chart's subclass labels, one or several to a line.
    "51 - PERSONNEL-SALARIES & WAGES",
    "54 - PROPERTY SERVICES 56 - SUPPLIES\n53 - PROF. & TECHNICAL SERVICES",
  ];
  for (const text of scraps) {
    test(`${JSON.stringify(text)} is dropped`, () => {
      expect(headingOf(text)).toEqual({ kind: "chart-scrap" });
    });
  }

  test("a title that only mentions a percentage stays a heading", () => {
    expect(headingOf("Anticipated 2027 Issuance ($66.5 million plus 1% for Closing)\nAnnual").kind).toBe("heading");
  });
});

test("notes and sentences printed as headings become small print and prose", () => {
  expect(headingOf("[Remainder of page intentionally left blank]")).toEqual({
    kind: "note",
    text: "[Remainder of page intentionally left blank]",
  });
  expect(headingOf("Note: Sevice Dog Licenses offered upon provision of required documentation").kind).toBe("note");
  expect(headingOf("Be it resolved by the Council of the City of Pittsburgh as follows:")).toEqual({
    kind: "prose",
    text: "Be it resolved by the Council of the City of Pittsburgh as follows:",
  });
});

test("subheadings inside the PDF's prose are sentence case", () => {
  expect(pdfHeadingText({ text: "Mission Statement", section: FIRE })).toBe("Mission statement");
  expect(pdfHeadingText({ text: "2026 Accomplishments", section: FIRE })).toBe("2026 accomplishments");
  expect(pdfHeadingText({ text: "Five-Year Expenditure Forecast", section: FIRE })).toBe("Five-year expenditure forecast");
  // A named unit of a department keeps its capitals.
  expect(pdfHeadingText({ text: "Construction Division", section: FIRE })).toBe("Construction Division");
  expect(pdfHeadingText({ text: "Bureau of Fire", section: FIRE })).toBe("Bureau of Fire");
});

test("table-of-contents labels taken from a table's row groups", () => {
  expect(tableGroupLabel("Temporary, Part-Time, and Seasonal Allowances")).toBe("Temporary, part-time, and seasonal allowances");
  expect(tableGroupLabel("BEGINNING RESERVE FUND")).toBe("Beginning reserve fund");
  // Divisions and programs are named units, printed as the PDF names them.
  expect(tableGroupLabel("Parks Maintenance")).toBe("Parks Maintenance");
  expect(tableGroupLabel("Law Enforcement Assisted Diversion (LEAD)")).toBe("Law Enforcement Assisted Diversion (LEAD)");
});

test("months in a heading's date keep their capital", () => {
  expect(headingOf("Active Grants\nAmount Spent and Remaining Balances are as of Nov. 1, 2026")).toEqual({
    kind: "heading",
    text: "Active grants amount spent and remaining balances are as of Nov. 1, 2026",
  });
});

test("an axis value in the PDF's prose is not a subheading", () => {
  expect(isPdfChartScrap("$800,000,000")).toBe(true);
  expect(isPdfChartScrap("$0 0.0%")).toBe(true);
  expect(isPdfChartScrap("Mission Statement")).toBe(false);
});

test("a department name printed in capitals keeps ordinary capitals", () => {
  expect(pdfHeadingText({ text: "BUREAU OF POLICE", section: FIRE })).toBe("Bureau of Police");
});

test("a subclass label in the PDF's prose is a chart label, with or without its dash", () => {
  expect(isPdfChartScrap("52 Personnel-Employee Benefits")).toBe(true);
  expect(isPdfChartScrap("2027 Expenditures by Subclass")).toBe(false);
});

test("subclass names in our own lists are sentence case", () => {
  expect(subclassLabel("51 - PERSONNEL-SALARIES & WAGES")).toBe("51 - Personnel-salaries & wages");
  expect(subclassLabel("53 - PROFESSIONAL & TECHNICAL SERVICES")).toBe("53 - Professional & technical services");
});
