/**
 * Public Source asked for the About text to pop up on the first page a reader
 * visits, to scroll through or close (2026-11-17). It is shown once per
 * browser: once closed it doesn't come back, on that page or any other.
 */
import { test, expect } from "./test-base";

test.use({ aboutIntroSeen: false });

const intro = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "About Pittsburgh Budget Explorer" });

test("a first-time reader's first page opens with the About text, which scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/departments/bureau-of-fire/");
  await expect(intro(page)).toBeVisible();
  await expect(intro(page)).toContainText("What is the Pittsburgh Budget Explorer?");
  await expect(intro(page)).toContainText("This site is not an official City of Pittsburgh publication");
  const scrolls = await intro(page).locator("[data-about-intro-body]").evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrolls).toBe(true);
});

test("once closed, the popup doesn't appear again on the next page", async ({ page }) => {
  await page.goto("/");
  await intro(page).getByRole("button", { name: "Close" }).first().click();
  await expect(intro(page)).toBeHidden();
  await page.goto("/flow/");
  await page.waitForLoadState("networkidle");
  await expect(intro(page)).toBeHidden();
});

test("the Escape key closes the popup", async ({ page }) => {
  await page.goto("/");
  await expect(intro(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(intro(page)).toBeHidden();
});

test("the About page itself doesn't pop up its own text", async ({ page }) => {
  await page.goto("/about/");
  await page.waitForLoadState("networkidle");
  await expect(intro(page)).toBeHidden();
});
