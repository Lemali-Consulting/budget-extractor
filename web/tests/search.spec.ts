/**
 * Search behaviour: the headline (2027) search box searches the full text of the
 * 2027 section and capital project pages; archive years keep their own search.
 */
import { test, expect, type Page } from "@playwright/test";

/** Type a query into the page's search box and return the results listbox. */
async function search(page: Page, query: string) {
  await page.locator("#budget-search").fill(query);
  return page.locator('[role="listbox"]');
}

test("headline search finds a word from the middle of a section's prose", async ({ page }) => {
  // "accreditation" sits deep in the Bureau of Police narrative, past the point the
  // old title-and-opening-words search could reach.
  await page.goto("/operating/");
  const results = await search(page, "accreditation");
  await expect(results.locator('a[href^="/sections/bureau-of-police/"]').first()).toBeVisible();
});

test("headline search finds text on capital project pages", async ({ page }) => {
  await page.goto("/operating/");
  const results = await search(page, "Hutchinson");
  await expect(
    results.locator('a[href^="/capital/capital-budget-introduction/"]').first(),
  ).toBeVisible();
});

test("headline search returns only 2027 pages, never the archive", async ({ page }) => {
  // "accreditation" also appears in the 2026 Bureau of Police page; the headline
  // search is scoped to the 2027 budget, so the archive copy must not appear.
  await page.goto("/operating/");
  const results = await search(page, "accreditation");
  await expect(results.locator("a").first()).toBeVisible();
  await expect(results.locator('a[href^="/2026/"], a[href^="/2025/"]')).toHaveCount(0);
});

test("headline search results show the budget type and a text excerpt", async ({ page }) => {
  // Readers need to see why a page matched before clicking through.
  await page.goto("/operating/");
  const results = await search(page, "Hutchinson");
  const hit = results.locator('a[href^="/capital/capital-budget-introduction/"]').first();
  await expect(hit).toContainText("Capital");
  await expect(hit.locator("mark").first()).toContainText(/Hutchinson/i);
});

test("headline search finds glossary definitions, labelled as glossary", async ({ page }) => {
  // "bondholders" appears only in a glossary definition, not on any budget page.
  await page.goto("/operating/");
  const results = await search(page, "bondholders");
  const hit = results.locator('a[href^="/glossary/"]').first();
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("Glossary");
});

test("archive search still finds 2026 sections inside the archive", async ({ page }) => {
  await page.goto("/2026/operating/");
  const results = await search(page, "Bureau of Police");
  await expect(results.locator('a[href^="/2026/sections/bureau-of-police/"]').first()).toBeVisible();
});
