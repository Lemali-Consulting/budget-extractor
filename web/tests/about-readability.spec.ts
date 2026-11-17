/**
 * Public Source found the About page's text hard to read at its old size
 * (2026-11-17): 16px, in lines running the full width of the page. Its prose
 * is now larger and kept to a readable line length.
 */
import { test, expect } from "./test-base";

/** Body text this size and up reads comfortably for long prose. */
const MIN_BODY_FONT_PX = 18;
/** About 75 characters of body text; longer lines are hard to track back to the start of. */
const MAX_LINE_PX = 800;

test("the About page's prose is at least 18px, in lines no wider than a comfortable reading width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/pittsburgh-budget-explorer-2027-explained/");
  const paragraphs = page.locator("main [data-about-body] p");
  expect(await paragraphs.count()).toBeGreaterThan(5);
  const sizes = await paragraphs.evaluateAll((ps) =>
    ps.map((p) => ({ size: parseFloat(getComputedStyle(p).fontSize), width: p.getBoundingClientRect().width })),
  );
  for (const { size, width } of sizes) {
    expect(size).toBeGreaterThanOrEqual(MIN_BODY_FONT_PX);
    expect(width).toBeLessThanOrEqual(MAX_LINE_PX);
  }
});
