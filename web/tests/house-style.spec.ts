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

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB_ROOT, "src");
const DIST = join(WEB_ROOT, "dist");
const GLOSSARY = join(WEB_ROOT, "..", "output", "glossary", "glossary.json");

/** Generated data from the PDF, and the hand-written display names of PDF capital project titles. */
const NOT_OUR_COPY = [join(SRC, "data"), join(SRC, "lib", "capital-project-names.ts")];

/** Official names that are printed with the comma. */
const OFFICIAL_NAMES = ["Permits, Licenses, and Inspections"];

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
