/**
 * The money flow page invites the reader to hover and click. Public Source's
 * fact-check (Rich's factcheck sheet "1126", row 7, column D) asked for
 * "Hover over" in the intro, and found the bands looked clickable (a pointer
 * cursor) but did nothing. Whatever shows the pointer must go somewhere: a
 * band that flows into a department opens that department's page.
 */
import { test, expect } from "./test-base";

test("the intro says to hover over a band", async ({ page }) => {
  await page.goto("/flow/");
  await expect(page.locator("main p").first()).toContainText("Hover over any band");
});

test("a band flowing into a department opens that department's page", async ({ page }) => {
  await page.goto("/flow/");
  const operating = page.locator("main svg").first();
  await expect(operating.locator("path").first()).toBeVisible();
  const band = operating.locator('a[href="/departments/bureau-of-police/"] path');
  await expect(band).toHaveCount(1);
  await band.click({ force: true });
  await expect(page).toHaveURL(/\/departments\/bureau-of-police\/$/);
});

test("nothing in the money flow shows a pointer unless clicking it goes somewhere", async ({ page }) => {
  await page.goto("/flow/");
  await expect(page.locator("main svg path").first()).toBeVisible();
  const deadPointers = await page.locator("main svg").evaluateAll((svgs) =>
    svgs.flatMap((svg) =>
      [...svg.querySelectorAll("path, rect")]
        .filter((el) => getComputedStyle(el).cursor === "pointer" && !el.closest("a"))
        .map((el) => el.getAttribute("data-node-id") ?? el.tagName),
    ),
  );
  expect(deadPointers).toEqual([]);
});

test("the operating flow's caption doesn't count the departments", async ({ page }) => {
  // Rich (row 7, item 4, 2026-11-16): say "departments", not "16 departments", so readers
  // don't take the count of large departments on the right for the number of city departments.
  await page.goto("/flow/");
  const caption = page.locator("main p").filter({ hasText: "feed the city's general budget" });
  await expect(caption).toContainText("distributed across departments on the right");
  await expect(caption).not.toContainText(/\d+ departments on the right/);
});
