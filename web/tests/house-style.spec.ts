/**
 * Public Source's house style in the copy we write ourselves (Rich via Max,
 * 2026-11-12): the budget is "the mayor's proposed 2027 budget", never
 * "FY2027 proposed"; lists take no Oxford comma. Text reproduced from the
 * budget PDF keeps its own punctuation, so the comma check reads our source
 * files, not the rendered pages.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { sentenceCase } from "../src/lib/text-case";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB_ROOT, "src");
const DIST = join(WEB_ROOT, "dist");
const GLOSSARY = join(WEB_ROOT, "..", "output", "glossary", "glossary.json");

/** Generated data from the PDF, and the hand-written display names of PDF capital project titles. */
const NOT_OUR_COPY = [join(SRC, "data"), join(SRC, "lib", "capital-project-names.ts")];

/** Official names, and PDF headings our code quotes, that are printed with the comma. */
const OFFICIAL_NAMES = ["Permits, Licenses, and Inspections", "Temporary, Part-Time, and Seasonal Allowances"];

/** "a, b, and c" or "a, b, or c", within one clause. */
const OXFORD_COMMA = /\w[^,.;:\n<>{}`"]*, [^,.;:\n<>{}`"]{1,60},\s+(?:and|or)\s/g;

function sourceFiles(dir: string): string[] {
  if (NOT_OUR_COPY.includes(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (NOT_OUR_COPY.includes(full)) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(astro|tsx?|mjs)$/.test(name) ? [full] : [];
  });
}

/** Code comments aren't copy. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "");
}

function oxfordCommas(text: string): string[] {
  // Copy wraps across source lines, so a list can break between its items.
  const unwrapped = text.replace(/\s*\n\s*/g, " ");
  const cleaned = OFFICIAL_NAMES.reduce((t, name) => t.split(name).join(""), unwrapped);
  return cleaned.match(OXFORD_COMMA) ?? [];
}

test("the site's own copy uses no Oxford commas", () => {
  const found = sourceFiles(SRC).flatMap((file) =>
    oxfordCommas(withoutComments(readFileSync(file, "utf8"))).map((m) => `${relative(WEB_ROOT, file)}: ${m}`),
  );
  expect(found).toEqual([]);
});

test("the glossary uses no Oxford commas", () => {
  expect(oxfordCommas(readFileSync(GLOSSARY, "utf8"))).toEqual([]);
});

test("no published page calls the budget FY2027", () => {
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "index.html" && readFileSync(full, "utf8").includes("FY2027")) pages.push(relative(DIST, full));
    }
  };
  walk(DIST);
  expect(pages).toEqual([]);
});

test("the banner calls it the Pittsburgh mayor's proposed 2027 budget", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("proposed-notice")).toContainText(
    "This is the Pittsburgh mayor’s proposed 2027 budget, pending City Council adoption",
  );
});

test("the home page says it shows the mayor's proposed 2027 budget", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toContainText("Showing the mayor's proposed 2027 budget.");
  await expect(page.locator("main")).toContainText("Proposed 2027 operating budget — largest 15 of");
});

/** In a sentence it is the "proposed 2027 budget" (Rich, 2026-11-12); a bare "2027 proposed" card label beside "2026 budget" is a column heading and stays. */
const YEAR_FIRST_PROSE = /2027 proposed (?:budget|operating|capital|revenue|Pittsburgh)/i;

test("no published page writes '2027 proposed' in a sentence", () => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "index.html") {
        const m = readFileSync(full, "utf8").replace(/<[^>]*>/g, "").match(YEAR_FIRST_PROSE);
        if (m) found.push(`${relative(DIST, full)}: ${m[0]}`);
      }
    }
  };
  walk(DIST);
  expect(found).toEqual([]);
});

test("PDF headings on a department page are sentence case", async ({ page }) => {
  await page.goto("/departments/bureau-of-fire/");
  const headings = page.locator("main h2");
  await expect(headings.filter({ hasText: /^Position summary$/ }).first()).toBeVisible();
  await expect(headings.filter({ hasText: /^Subclass detail$/ }).first()).toBeVisible();
  await expect(headings.filter({ hasText: "Bureau of Fire 2027 expenditures by subclass" })).toHaveCount(1);
  await expect(page.locator("main")).not.toContainText("BUREAU OF FIRE 2027");
  await expect(headings.filter({ hasText: /^\d{2} - / })).toHaveCount(0);
  await expect(page.getByText("51 - Personnel-salaries & wages").first()).toBeVisible();
  await page.goto("/departments/commission-on-human-relations/");
  await expect(page.locator("main h3").filter({ hasText: /^2026 accomplishments$/ }).first()).toBeAttached();
  await expect(page.locator("main")).toContainText("Temporary, part-time, and seasonal allowances");
});

test("the top positions table labels its columns in sentence case", async ({ page }) => {
  await page.goto("/departments/bureau-of-fire/");
  const header = page.locator("table", { has: page.locator("th", { hasText: "Position" }) }).first().locator("thead");
  await expect(header).toContainText("2027 budget");
  await expect(header).not.toContainText("2027 Budget");
});

/** Chart axis values and pie-slice labels the extractor read as titles. */
const CHART_SCRAP_HEADING = /^\s*\$|\d%\s*$|\$[\d,]{5,}\s*$/;

test("no published page shows a chart value as a heading", () => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "index.html") {
        for (const m of readFileSync(full, "utf8").matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)) {
          const text = m[1].replace(/<[^>]*>/g, "").trim();
          if (CHART_SCRAP_HEADING.test(text)) found.push(`${relative(DIST, full)}: ${text}`);
        }
      }
    }
  };
  walk(DIST);
  expect(found).toEqual([]);
});

/** "Five-year" is generic (Rich, 2026-11-12); the PDF's own "Five-Year Plan" in its prose is left as printed. */
const CAPITALIZED_FIVE_YEAR = /Five-Year (?:[Ff]inancial|[Ee]xpenditure|[Ff]orecast)/;

test("no published page capitalizes 'Five-Year' in a section or heading name", () => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "index.html") {
        const m = readFileSync(full, "utf8").replace(/<[^>]*>/g, " ").match(CAPITALIZED_FIVE_YEAR);
        if (m) found.push(`${relative(DIST, full)}: ${m[0]}`);
      }
    }
  };
  walk(DIST);
  expect(found).toEqual([]);
});

/** A section's cover page (its name over the city seal) repeats the page title, so it isn't shown (Rich, 2026-11-12). */
test("no published page shows a section's cover page", () => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "index.html" && readFileSync(full, "utf8").includes("Department seal")) found.push(relative(DIST, full));
    }
  };
  walk(DIST);
  expect(found).toEqual([]);
});

test("glossary terms are sentence case, named funds and programs keep their capitals", async ({ page }) => {
  await page.goto("/glossary/");
  const terms = page.locator("main dt");
  for (const term of ["Cost center", "Transfer in", "Beginning reserve fund balance", "Real estate tax", "Health benefits", "Reserve fund"]) {
    await expect(terms.filter({ hasText: new RegExp(`^\\s*${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) })).toHaveCount(1);
  }
  // A funding source's term follows a code badge carrying the same name.
  for (const source of ["Bond", "Other"]) {
    await expect(terms.filter({ hasText: new RegExp(`^\\s*${source}\\s+${source}\\s*$`) })).toHaveCount(1);
  }
  await expect(terms.filter({ hasText: /\b(?:BOND|OTHER)\b/ })).toHaveCount(0);
  await expect(terms.filter({ hasText: /^\s*Technology Modernization Fund\s*$/ })).toHaveCount(1);
  const main = page.locator("main");
  await expect(main).toContainText("Site safety plan.");
  await expect(main).toContainText("Compound annual growth rate");
  await expect(main).toContainText("Community Development Block Grant.");
});

test("capital funding sources are named in sentence case, acronyms kept", async ({ page }) => {
  expect(sentenceCase("PAYGO")).toBe("PAYGO");
  expect(sentenceCase("OTHER")).toBe("Other");
  await page.goto("/capital/");
  const chart = page.getByRole("heading", { name: /Funding by source/ }).locator("..");
  await expect(chart).toContainText("Bond");
  await expect(chart).not.toContainText("BOND");
  await page.goto("/flow/");
  await expect(page.locator("main svg text", { hasText: /^Bond$/ }).first()).toBeAttached();
});

test("the trends page's revenue buttons are sentence case", async ({ page }) => {
  await page.goto("/trends/");
  await expect(page.getByRole("button", { name: "Payroll preparation tax", exact: true })).toBeVisible();
});

test("table links and locators on section pages are sentence case", async ({ page }) => {
  await page.goto("/departments/bureau-of-fire/");
  await expect(page.getByRole("link", { name: /Open in data explorer/ }).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Open in Explorer");
  await expect(page.locator("main")).toContainText(/Page \d+, table \d+/);
});

test("operating index cards preview prose, not a chart title", async ({ page }) => {
  await page.goto("/operating/");
  await expect(page.locator("main")).not.toContainText("Expenditures by Subclass");
  await expect(page.locator("main")).not.toContainText("PROF. & TECHNICAL SERVICES");
});

test("operating index cards preview the opening paragraph, not the PDF subheading above it", async ({ page }) => {
  // The PDF's subheadings ("Description of Services") sit at the top of the prose block;
  // run into the preview they read as a title-case sentence fragment.
  await page.goto("/operating/");
  const main = page.locator("main");
  for (const subheading of ["Description of Services", "By Department The table", "Revenue Summary Major Tax Revenues", "Mission The mission"]) {
    await expect(main).not.toContainText(subheading);
  }
  await expect(main).toContainText("City Council is the legislative branch");
});
