/**
 * A department's position summary is one table. The PDF prints the permanent
 * positions, then a list of temporary, part-time and seasonal jobs, then a
 * roll-up (the permanent total again, the temporary allowance, the vacancy
 * allowance and net salaries), and the extractor splits that across two or
 * three tables. Public Source's fact-check found the split confusing (Rich's
 * factcheck sheet "1126", row 30 and the rows that point to it); Max chose to
 * cut the itemized temporary list and keep the roll-up (2026-11-14). The
 * roll-up's net salaries are what the homepage payroll total adds up, so they
 * have to stay visible.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./test-base";
import { withMergedPositionTables } from "../src/lib/position-tables";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const HEADERS = ["Title", "2026 FTE", "Rate/ Grade", "Hours/ Months", "2026 Budget", "2027 FTE", "Rate/ Grade", "Hours/ Months", "2027 Budget"];
const TOTAL_PERMANENT = ["Total Full-Time Permanent Positions", "845", "", "", "75,635,012", "845", "", "", "75,927,967"];
const ROLL_UP = [
  ["Temporary, Part-Time, and Seasonal Allowances", "—", "", "", "29,487", "—", "", "", "30,372"],
  ["Vacancy Allowance", "—", "", "", "—", "—", "", "", "—"],
  ["Total Full-Time Positions & Net Salaries", "845", "", "", "75,664,499", "845", "", "", "75,958,339"],
];
const PERMANENT = [["Police Officer", "800", "", "12", "70,000,000", "800", "", "12", "70,300,000"], TOTAL_PERMANENT];
const TEMPORARY_LIST = [
  ["Temporary, Part-Time, and Seasonal Allowances", "", "", "", "", "", "", "", ""],
  ["Assistant I, Administrative, Part Time", "—", "21.64", "1,500", "29,487", "—", "22.28", "1,363", "30,372"],
  ["", "—", "", "", "29,487", "—", "", "", "30,372"],
];

function section(tables: { id: string; table_type: string; headers?: string[]; rows: string[][] }[]) {
  return { slug: "bureau-of-police", tables: tables.map((t) => ({ headers: HEADERS, ...t })), page_content: [] };
}

test("the temporary list is cut and the roll-up joins the permanent table", () => {
  const out = withMergedPositionTables(
    section([
      { id: "p4_t0", table_type: "personnel", rows: PERMANENT },
      { id: "p4_t1", table_type: "personnel", rows: [...TEMPORARY_LIST, TOTAL_PERMANENT, ...ROLL_UP] },
      { id: "p6_t0", table_type: "financial_summary", rows: [["Salaries", "1"]] },
    ]),
  );
  expect(out.tables.map((t) => t.id)).toEqual(["p4_t0", "p6_t0"]);
  expect(out.tables[0].rows).toEqual([...PERMANENT, ...ROLL_UP]);
});

test("a roll-up printed on its own after a temporary-only table is kept, the temporary table cut", () => {
  // Bureau of Fire: the recruits' list and the roll-up are two tables.
  const out = withMergedPositionTables(
    section([
      { id: "t0", table_type: "personnel", rows: PERMANENT },
      { id: "t1", table_type: "personnel", rows: TEMPORARY_LIST },
      { id: "t2", table_type: "personnel", rows: [TOTAL_PERMANENT, ...ROLL_UP] },
    ]),
  );
  expect(out.tables.map((t) => t.id)).toEqual(["t0"]);
  expect(out.tables[0].rows).toEqual([...PERMANENT, ...ROLL_UP]);
});

test("a permanent total printed twice in a row is shown once", () => {
  // Office of Municipal Investigations: no temporary jobs, the roll-up repeats the total straight after it.
  const out = withMergedPositionTables(section([{ id: "t0", table_type: "personnel", rows: [...PERMANENT, TOTAL_PERMANENT, ...ROLL_UP] }]));
  expect(out.tables[0].rows).toEqual([...PERMANENT, ...ROLL_UP]);
});

test("a roll-up the extractor read with five columns is spread back into the table's nine", () => {
  // Permits, Licenses and Inspections; Community Health and Safety: the second table lost its empty columns and its header row is an intern.
  const out = withMergedPositionTables(
    section([
      { id: "t0", table_type: "personnel", rows: PERMANENT },
      {
        id: "t1",
        table_type: "unknown",
        headers: ["PLI Interns", "—  9.00-14.00 —", "5,000", "—  9.00-14.00 —", "5,000"],
        rows: [
          ["", "—", "5,000", "—", "5,000"],
          ["Total Full-Time Permanent Positions", "845", "75,635,012", "845", "75,927,967"],
          ["Vacancy Allowance", "—", "(521,979)", "—", "(252,131)"],
          ["Total Full-Time Positions and Net Salaries", "845", "75,113,033", "845", "75,675,836"],
        ],
      },
    ]),
  );
  expect(out.tables.map((t) => t.id)).toEqual(["t0"]);
  expect(out.tables[0].rows).toEqual([
    ...PERMANENT,
    ["Vacancy Allowance", "—", "", "", "(521,979)", "—", "", "", "(252,131)"],
    ["Total Full-Time Positions and Net Salaries", "845", "", "", "75,113,033", "845", "", "", "75,675,836"],
  ]);
});

test("the heading over a cut temporary table goes with it", () => {
  const out = withMergedPositionTables({
    ...section([
      { id: "t0", table_type: "personnel", rows: PERMANENT },
      { id: "t1", table_type: "unknown", headers: ["PLI Interns", "a", "b", "c", "d"], rows: [["Total Full-Time Permanent Positions", "1", "2", "3", "4"], ["Total Full-Time Positions and Net Salaries", "1", "2", "3", "4"]] },
    ]),
    page_content: [{ relative_page: 5, text_blocks: [{ role: "section_title", text: "Temporary, Part-Time, and Seasonal Allowances" }, { role: "narrative", text: "Kept." }] }],
  });
  expect(out.page_content[0].text_blocks.map((b) => b.text)).toEqual(["Kept."]);
});

test("a section without a roll-up is left as it is", () => {
  // Trust funds can print two units' positions in one table, each ending in its own permanent total.
  const input = section([{ id: "t0", table_type: "personnel", rows: [...PERMANENT, ["Other unit", "", "", "", "", "", "", "", ""], ...PERMANENT] }]);
  expect(withMergedPositionTables(input)).toEqual(input);
});

/**
 * The visible text of the page's reproduction of the PDF, from its "Position summary" heading on.
 * The summary above it ranks the top positions from the personnel data, temporary jobs included; that isn't the PDF's table.
 */
function pdfSectionText(path: string): string {
  const html = readFileSync(join(DIST, path, "index.html"), "utf8");
  return html
    .slice(html.search(/<h2[^>]*>\s*Position summary/))
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const BUILT = [
  // [page, a temporary job that must be gone, its net salaries that must stay]
  ["departments/bureau-of-police", "Assistant I, Administrative, Part Time", "75,958,339"],
  ["departments/department-of-parks-and-recreation", "First Year Lifeguard", "5,261,618"],
  ["departments/department-of-permits-licenses-and-inspections", "PLI Interns", "8,166,213"],
  ["departments/office-of-community-health-and-safety", "Intern - Public Health", "3,115,228"],
  ["departments/bureau-of-fire", "Firefighter Recruit Allowance", "61,908,487"],
] as const;

for (const [path, temporaryJob, netSalaries] of BUILT) {
  test(`/${path}/ lists no temporary jobs but keeps its net salaries`, () => {
    const text = pdfSectionText(path);
    expect(text).not.toContain(temporaryJob);
    expect(text).toContain(netSalaries);
    expect(text.match(/Total Full[- ]Time Permanent Positions/gi)).toHaveLength(1);
  });
}
