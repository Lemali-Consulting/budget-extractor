/**
 * Search behaviour: the headline (2027) search box searches the full text of the
 * 2027 department and citywide section pages.
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
  await expect(results.locator('a[href^="/departments/bureau-of-police/"]').first()).toBeVisible();
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
  const results = await search(page, "accreditation");
  const hit = results.locator('a[href^="/departments/bureau-of-police/"]').first();
  await expect(hit).toContainText("Operating");
  await expect(hit.locator("mark").first()).toContainText(/accreditation/i);
});

test("headline search finds glossary definitions, labelled as glossary", async ({ page }) => {
  // "bondholders" appears only in a glossary definition, not on any budget page.
  await page.goto("/operating/");
  const results = await search(page, "bondholders");
  const hit = results.locator('a[href^="/glossary/"]').first();
  await expect(hit).toBeVisible();
  await expect(hit).toContainText("Glossary");
});
