/**
 * Public Source asked for embed codes for three home-page pieces (2026-11-17):
 * the five summary cards, "Where the money flows" and "Top departments by
 * budget". Each has a frameable page under /embed/ showing just that piece.
 */
import { test, expect } from "./test-base";
import { EMBED_PAGES } from "./published-pages";
import { EMBED_HEIGHT_MESSAGE } from "../src/lib/embed";

test("the budget summary embed shows the home page's five cards, with the same figures", async ({ page }) => {
  await page.goto("/");
  const homeCards = await page.locator("[data-testid='summary-cards'] > div").allInnerTexts();
  await page.goto("/embed/budget-summary/");
  const embedCards = await page.locator("[data-testid='summary-cards'] > div").allInnerTexts();
  expect(embedCards).toHaveLength(5);
  expect(embedCards).toEqual(homeCards);
});

test("the money flow embed shows the flow diagram under its heading", async ({ page }) => {
  await page.goto("/embed/money-flow/");
  await expect(page.getByRole("heading", { name: "Where the money flows" })).toBeVisible();
  await expect(page.locator("svg[aria-label='Sankey flow diagram']")).toBeVisible();
});

test("the top departments embed draws its bar chart", async ({ page }) => {
  await page.goto("/embed/top-departments/");
  await expect(page.getByRole("heading", { name: "Top departments by budget" })).toBeVisible();
  await expect(page.locator("[data-testid='top-departments'] svg").first()).toBeVisible();
});

for (const path of EMBED_PAGES) {
  test(`${path} is just the piece: no site navigation, popup or search listing, and links leave the frame`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("nav, footer nav, #about-intro")).toHaveCount(0);
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /noindex/);
    // Every link opens in a new tab rather than replacing the story it's embedded in.
    await expect(page.locator("base")).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("link", { name: "Pittsburgh Budget Explorer" })).toBeVisible();
  });
}

for (const startHeight of [150, 2000]) {
test(`an embed tells the page around it how tall it is, so a frame starting ${startHeight}px tall can fit it`, async ({ page, baseURL }) => {
  await page.setContent(`<!doctype html><body><script>
    const EMBED_HEIGHT_MESSAGE = ${JSON.stringify(EMBED_HEIGHT_MESSAGE)};
    window.heights = [];
    window.addEventListener("message", (e) => { if (e.data && e.data.type === EMBED_HEIGHT_MESSAGE) window.heights.push(e.data.height); });
  </script><iframe src="${baseURL}/embed/budget-summary/" height="${startHeight}" style="width:600px;border:0"></iframe></body>`);
  await expect.poll(() => page.evaluate(() => (window as any).heights.length)).toBeGreaterThan(0);
  // The height reported is the piece's own, whatever the frame's size: a frame
  // that starts too tall must be able to shrink, not just grow.
  const last = await page.evaluate(() => (window as any).heights.at(-1));
  expect(last).toBeGreaterThan(300);
  expect(last).toBeLessThan(700);
});
}

/** A stand-in story page framing an embed, as Public Source's site will. */
async function framed(page: import("@playwright/test").Page, opts: { src: string; width: number }) {
  await page.setContent(`<!doctype html><body><iframe src="${opts.src}" style="width:${opts.width}px;height:900px;border:0"></iframe></body>`);
  return page.frameLocator("iframe");
}

test("in a story-width frame, every bar's value fits inside the top departments chart", async ({ page, baseURL }) => {
  const frame = await framed(page, { src: `${baseURL}/embed/top-departments/`, width: 600 });
  const chart = frame.locator("[data-testid='top-departments'] svg").filter({ has: page.locator("rect") }).first();
  await expect(chart).toBeVisible();
  const overflow = await chart.evaluate((svg) => {
    const right = svg.getBoundingClientRect().right;
    return [...svg.querySelectorAll("text")].filter((t) => t.getBoundingClientRect().right > right + 0.5).map((t) => t.textContent);
  });
  expect(overflow).toEqual([]);
});

test("clicking a department's bar inside an embed opens its page in a new tab, leaving the story in place", async ({ page, baseURL }) => {
  const frame = await framed(page, { src: `${baseURL}/embed/top-departments/`, width: 700 });
  // The first bar is the largest department's; Plot sets the bars' fill on their group.
  const bar = frame.locator("[data-testid='top-departments'] svg g[fill] > rect").first();
  await expect(bar).toBeVisible();
  const popup = page.waitForEvent("popup");
  await bar.click();
  expect((await popup).url()).toContain("/departments/");
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "Top departments by budget" })).toBeVisible();
});
