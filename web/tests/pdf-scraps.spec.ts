/**
 * The department and citywide section pages reproduce the budget PDF, and the
 * extractor carries over scraps of it that aren't text a reader can use: a pie
 * chart's title and labels, a heading the PDF repeats on a table's continued
 * page, and table fragments. Public Source's fact-check asked for each of
 * these to go (Rich's factcheck sheet "1126", 2026-11-13; rows cited below
 * are on the preview at public-source-blue-increases--pgh-budget-explorer).
 *
 * These read the built pages, so they check what a reader gets.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./test-base";
import { DEPARTMENT_SLUGS } from "./published-pages";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

function builtPage(path: string): string {
  return readFileSync(join(DIST, path, "index.html"), "utf8");
}

const departmentPage = (slug: string): string => builtPage(`departments/${slug}`);

/** The page's visible text, scripts and markup removed. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** The visible text outside reproduced tables, whose rows do list subclasses. */
function textOutsideTables(html: string): string {
  return visibleText(html.replace(/<table[\s\S]*?<\/table>/g, " "));
}

/** The PDF's headings as the page shows them, in order. */
function pdfHeadings(html: string): string[] {
  return [...html.matchAll(/<h2 id="heading-\d+"[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => visibleText(m[1]).trim());
}

/** The type badge each reproduced table carries, as the extractor names the type ("personnel", "unknown"). */
function tableTypeBadges(html: string): string[] {
  return [...html.matchAll(/data-testid="table-type-badge"[^>]*>([^<]*)</g)].map((m) => m[1].trim());
}

/** A subclass pie chart's label, printed in capitals: "56 - SUPPLIES". */
const SUBCLASS_CHART_LABEL = /\b\d{2} - [A-Z][A-Z.&-]{3,}/;

test.describe("department pages", () => {
  for (const slug of DEPARTMENT_SLUGS) {
    test(`/departments/${slug}/ reads "Five-year forecast", never "Five year"`, () => {
      // Rows 16, 20–25, 27, 29, 31–41, 44–46.
      expect(visibleText(departmentPage(slug))).not.toMatch(/\bfive year\b/i);
    });

    test(`/departments/${slug}/ shows none of the subclass pie chart's title or labels`, () => {
      // Rows 24, 25, 30, 34–38, 40, 42, 43, 45, 46. The chart itself isn't shown.
      const text = textOutsideTables(departmentPage(slug));
      expect(text).not.toMatch(/expenditures by subclass/i);
      expect(text).not.toMatch(SUBCLASS_CHART_LABEL);
    });

    test(`/departments/${slug}/ doesn't repeat a heading where the PDF continues a table onto the next page`, () => {
      // Rows 31, 36, 39: a stray "Position summary".
      const headings = pdfHeadings(departmentPage(slug));
      const repeats = headings.filter((h, i) => i > 0 && h === headings[i - 1]);
      expect(repeats).toEqual([]);
    });
  }
});

test.describe("tables the fact-check found were fragments, not tables", () => {
  const pages = [
    // Row 22, item 1: Finance's share of three positions, split off from the Three Taxing Bodies Trust Fund's allocation table.
    "departments/department-of-finance",
    // Rows 27 and 28: a subclass pie chart's labels, read as a table.
    "departments/bureau-of-administration-public-safety",
    // Row 32, item 3.
    "departments/citizen-police-review-board",
    // Row 19, item 1: the department table's total row run together with the next table's header.
    "sections/expenditure-summary",
  ];
  for (const path of pages) {
    test(`/${path}/ shows no table of unknown type`, () => {
      expect(tableTypeBadges(builtPage(path))).not.toContain("unknown");
    });
  }

  test("the citywide expenditure summary has no table headed with a run-together total", () => {
    // The viewer sentence-cases column headers, so the match ignores case.
    expect(visibleText(builtPage("sections/expenditure-summary"))).not.toMatch(/total expenditures \$ 667,025,881 expenditures by subclass/i);
  });
});

test.describe("broken PDF text the fact-check asked to cut", () => {
  test("Finance has no caption for the split-off allocation table", () => {
    // Row 22, item 2.
    expect(visibleText(departmentPage("department-of-finance"))).not.toContain("Department Three Taxing Bodies 2027 Allocations");
  });

  test("Finance has no half-sentence note under its subclass detail", () => {
    // Row 22, item 3: the note's first lines were lost; only its end survives.
    expect(visibleText(departmentPage("department-of-finance"))).not.toContain("to prior funding calculations");
  });

  test("Management and Budget has no small-print notes under its subclass detail", () => {
    // Row 43, item 2.
    expect(visibleText(departmentPage("office-of-management-and-budget"))).not.toContain("General Fund-Out is broken down as follows");
  });
});
