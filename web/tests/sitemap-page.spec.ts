/**
 * The site map lists every published page, so Public Source can check the
 * site against its fact-check by eye (Max, 2026-11-17). It is built from the
 * same list the build and the tests use, so it can't name a page the site
 * doesn't publish or miss one it does. Retired pages are not listed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./test-base";
import { PUBLISHED } from "./published-pages";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SITE_TITLE_SUFFIX = " | Pittsburgh Budget Explorer";

/** A built page's title, without the site name after it; the home page's title is the site name alone. */
function builtTitle(path: string): string {
  const html = readFileSync(join(DIST, path, "index.html"), "utf8");
  const title = html.match(/<title>([^<]*)<\/title>/)![1].replace(/&amp;/g, "&");
  return path === "/" ? "Home" : title.replace(SITE_TITLE_SUFFIX, "");
}

test("the site map links every published page exactly once, and nothing else", async ({ page }) => {
  await page.goto("/sitemap/");
  const hrefs = await page.locator("main [data-testid='sitemap'] a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect([...hrefs].sort()).toEqual([...PUBLISHED].sort());
});

test("each site map entry is named as its page is titled", async ({ page }) => {
  await page.goto("/sitemap/");
  const links = await page
    .locator("main [data-testid='sitemap'] a[href]")
    .evaluateAll((els) => els.map((e) => ({ href: e.getAttribute("href")!, text: e.textContent!.trim() })));
  const mismatched = links.filter((l) => l.text !== builtTitle(l.href)).map((l) => `${l.href}: "${l.text}" vs "${builtTitle(l.href)}"`);
  expect(mismatched).toEqual([]);
});

test("the site map states how many pages the site has", async ({ page }) => {
  await page.goto("/sitemap/");
  await expect(page.locator("main")).toContainText(`${PUBLISHED.size} pages`);
});

test("every page's footer links to the site map", async ({ page }) => {
  await page.goto("/departments/bureau-of-fire/");
  await expect(page.locator("footer a[href='/sitemap/']")).toHaveText("Site map");
});
