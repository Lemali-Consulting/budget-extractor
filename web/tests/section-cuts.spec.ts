/**
 * Parts of section pages Public Source's fact-check asked to cut (Rich's
 * factcheck sheet "1126", 2026-11-13; Max, 2026-11-14). Each cut runs from a
 * heading to the end of the section, or removes one table; what comes before
 * the cut must stay. Rows cite the sheet.
 *
 * These read the built pages, so they check what a reader gets.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./test-base";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/** The page's visible text, scripts and markup removed. */
function pageText(path: string): string {
  return readFileSync(join(DIST, path, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** The type each reproduced table carries (not shown to readers), as the extractor names the type. */
function tableTypeBadges(path: string): string[] {
  const html = readFileSync(join(DIST, path, "index.html"), "utf8");
  return [...html.matchAll(/data-table-type="([^"]*)"/g)].map((m) => m[1]);
}

test("the revenue summary ends before its tax vs. non-tax revenue charts", () => {
  // Row 18: "cut the section '2027 tax vs. non-tax revenue' and everything below that".
  const text = pageText("sections/revenue-summary");
  expect(text).not.toMatch(/tax vs\. non-tax revenue/i);
  // The prose below the cut (the kept tables name these revenues as rows).
  expect(text).not.toContain("Fines and Forfeitures revenues are budgeted at");
  expect(text).not.toContain("Intergovernmental revenues are budgeted at");
  // Kept: the tables above it and the paragraph that opens the page it starts on.
  expect(text).toMatch(/historical revenue/i);
  expect(text).toContain("Projected fiscal year 2027 revenues total $727,326,776");
});

test("the expenditure summary ends before its expenditures by subclass", () => {
  // Row 19, item 2: "cut everything from 'Expenditures by subclass' down".
  const text = pageText("sections/expenditure-summary");
  expect(text).not.toMatch(/expenditures by subclass/i);
  expect(text).not.toMatch(/five-year expenditure forecast/i);
  expect(text).not.toMatch(/personnel vs\. non-personnel/i);
  // Kept: the paragraph the cut starts in, up to the subheading.
  expect(text).toContain("The City Council budgets amount to $6,578,891");
});

test("the expenditures detail shows its account summary heading once", () => {
  // Row 26: the two repeated "Expenditure account summary" headings at the bottom.
  expect(pageText("sections/expenditures-detail").match(/Expenditure account summary/g)?.length ?? 0).toBeLessThanOrEqual(2);
  const html = readFileSync(join(DIST, "sections/expenditures-detail/index.html"), "utf8");
  expect(html.match(/<h2 id="heading-\d+"[^>]*>\s*Expenditure account summary/g)).toHaveLength(1);
});

test("the Public Safety administration page has no allocation table", () => {
  // Row 28 (filed against the Public Works administration page; the table is on Public Safety's).
  expect(tableTypeBadges("departments/bureau-of-administration-public-safety")).not.toContain("allocation");
});
