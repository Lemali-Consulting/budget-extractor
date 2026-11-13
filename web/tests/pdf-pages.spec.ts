/**
 * A section's cover page, its name printed over the city seal, repeats the
 * page's own title, so the site leaves it out (Rich via Max, 2026-11-12).
 * Pages with anything else on them stay.
 */
import { test, expect } from "./test-base";
import { isCoverPage } from "../src/lib/pdf-pages";

const SEAL = { chart_type: "logo", bbox: [0, 0, 1, 1] };
const title = (text: string, role = "section_title") => ({ text, role, bbox: [0, 0, 1, 1] });
const page = (opts: { text_blocks: unknown[]; chart_regions: unknown[] }) => ({ relative_page: 0, ...opts });
const NO_TABLES = new Set<number>();

test("a name over the seal is a cover page", () => {
  expect(isCoverPage({ page: page({ text_blocks: [title("Five-Year\nFinancial Forecast")], chart_regions: [SEAL] }), tablePages: NO_TABLES })).toBe(true);
});

test("the name may be printed differently from the section's title, or read as prose", () => {
  // The revenue summary's cover says "Revenue"; some department names come through as prose.
  expect(isCoverPage({ page: page({ text_blocks: [title("Revenue")], chart_regions: [SEAL] }), tablePages: NO_TABLES })).toBe(true);
  expect(isCoverPage({ page: page({ text_blocks: [title("Department of\nParks and\nRecreation", "narrative")], chart_regions: [SEAL] }), tablePages: NO_TABLES })).toBe(true);
});

test("a page with a paragraph beside the seal is not a cover page", () => {
  const paragraph = title("As authorized by File 2026-1131, as submitted by the Mayor, the fees listed below are adopted.", "narrative");
  expect(isCoverPage({ page: page({ text_blocks: [paragraph], chart_regions: [SEAL] }), tablePages: NO_TABLES })).toBe(false);
});

test("a page with a table or another image is not a cover page", () => {
  const cover = page({ text_blocks: [title("Bureau of Fire")], chart_regions: [SEAL] });
  expect(isCoverPage({ page: cover, tablePages: new Set([0]) })).toBe(false);
  const withChart = page({ text_blocks: [title("Bureau of Fire")], chart_regions: [SEAL, { chart_type: "raster_image", bbox: [0, 0, 1, 1] }] });
  expect(isCoverPage({ page: withChart, tablePages: NO_TABLES })).toBe(false);
});

test("a page without the seal is not a cover page", () => {
  expect(isCoverPage({ page: page({ text_blocks: [title("Target Budget")], chart_regions: [] }), tablePages: NO_TABLES })).toBe(false);
});
