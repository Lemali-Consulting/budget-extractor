/**
 * The revenue summary's first page prints two tables: revenue by subclass,
 * ending with an "Annual Growth Rate" row (2.2%, 0.9%, 0.9%, 0.9% under
 * 2028-2031), and below it a "Tax Revenue" table. The extractor read the
 * growth-rate row and the second table's title as that table's column
 * headings ("Annual Growth Rate Tax Revenue", "2.2% 2028", ...). Public
 * Source's fact-check (Rich's factcheck sheet "1126", row 18, column G) found
 * table 2 "wonky, axes got smushed together". The headings must read as the
 * PDF prints them, and the growth rates must stay on the page, under the
 * table they belong to.
 */
import { test, expect } from "./test-base";
import { withGrowthRateRowRestored } from "../src/lib/growth-rate-row";
import { columnHeaderLabel } from "../src/lib/text-case";

const SUBCLASS_TABLE = {
  id: "s4_p1_t0",
  relative_page: 1,
  table_type: "forecast",
  headers: ["", "2027", "2028", "2029", "2030", "2031", "CAGR*"],
  rows: [["Total Revenues", "698,771,868", "713,989,667", "720,312,447", "726,831,160", "733,526,827", "1.2%"]],
};
const TAX_TABLE = {
  id: "s4_p1_t1",
  relative_page: 1,
  table_type: "revenue",
  headers: ["Annual Growth Rate Tax Revenue", "2027", "2.2% 2028", "0.9% 2029", "0.9% 2030", "0.9% 2031", "CAGR*"],
  rows: [["Real Estate Tax", "171,390,520", "172,703,636", "171,749,054", "170,813,859", "169,896,814", "(0.2)%"]],
};

test("the growth rates go back under the table above, as the PDF prints them", () => {
  const { tables } = withGrowthRateRowRestored({ tables: [SUBCLASS_TABLE, TAX_TABLE] });
  expect(tables[0].rows.at(-1)).toEqual(["Annual Growth Rate", "", "2.2%", "0.9%", "0.9%", "0.9%", ""]);
  expect(tables[0].rows).toHaveLength(2);
});

test("the table below gets back its own headings: its title over the label column, plain years over the rest", () => {
  const { tables } = withGrowthRateRowRestored({ tables: [SUBCLASS_TABLE, TAX_TABLE] });
  expect(tables[1].headers).toEqual(["Tax Revenue", "2027", "2028", "2029", "2030", "2031", "CAGR*"]);
  expect(tables[1].rows).toEqual(TAX_TABLE.rows);
});

test("a section without merged growth rates is left as it is", () => {
  const section = { tables: [SUBCLASS_TABLE, { ...TAX_TABLE, headers: ["Tax Revenue", "2027", "2028", "2029", "2030", "2031", "CAGR*"] }] };
  expect(withGrowthRateRowRestored(section)).toEqual(section);
});

test("merged growth rates are left alone when the table above has different years", () => {
  const above = { ...SUBCLASS_TABLE, headers: ["", "2021 Actual", "2022 Actual"] };
  const section = { tables: [above, TAX_TABLE] };
  expect(withGrowthRateRowRestored(section)).toEqual(section);
});

test("CAGR keeps its capitals in a column heading", () => {
  expect(columnHeaderLabel("CAGR*")).toBe("CAGR*");
});

test("the revenue summary's tables read as the PDF prints them", async ({ page }) => {
  await page.goto("/sections/revenue-summary/");
  const subclass = page.locator("#table-container-s4_p1_t0");
  const growth = subclass.locator("tbody tr").last();
  await expect(growth.locator("td").first()).toHaveText("Annual Growth Rate");
  await expect(growth).toContainText("2.2%");
  const taxHeaders = page.locator("#table-container-s4_p1_t1 thead th");
  await expect(taxHeaders.first()).toHaveText("Tax revenue");
  expect((await taxHeaders.allTextContents()).filter((h) => h.includes("%"))).toEqual([]);
  const allHeaders = await page.locator("main thead th").allTextContents();
  expect(allHeaders.filter((h) => h.includes("Cagr"))).toEqual([]);
  expect(allHeaders.filter((h) => h.includes("CAGR*")).length).toBeGreaterThan(0);
});
