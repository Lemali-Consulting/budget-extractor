/**
 * The About page is the version Max wrote with Public Source's suggestions
 * (Rich's factcheck sheet "1126", row 15, column N, and the Google Doc it
 * links; Max, 2026-11-16). It carries a byline and author bio, says where
 * to report an error, and links the two source PDFs and the public code.
 */
import { test, expect } from "./test-base";

test("the About page is titled and bylined as written", async ({ page }) => {
  await page.goto("/about/");
  const main = page.locator("main");
  await expect(main.locator("h1")).toHaveText("About Pittsburgh Budget Explorer");
  await expect(main).toContainText("By Max Chis");
  await expect(main).toContainText("Max Chis is the founder of Lemali Consulting");
  await expect(page).toHaveTitle("About | Pittsburgh Budget Explorer");
});

test("the About page links the two source PDFs, the city's budget page and the code", async ({ page }) => {
  await page.goto("/about/");
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "City of Pittsburgh’s proposed 2027 operating budget" }))
    .toHaveAttribute("href", /2027-mayors-operating-budget\.pdf$/);
  await expect(main.getByRole("link", { name: "proposed 2027 capital budget" }))
    .toHaveAttribute("href", /2027-mayors-capital-budget\.pdf$/);
  await expect(main.getByRole("link", { name: "official budget documents" }))
    .toHaveAttribute("href", /Budgets-and-Reports$/);
  await expect(main.getByRole("link", { name: "GitHub", exact: true }))
    .toHaveAttribute("href", "https://github.com/Lemali-Consulting/budget-extractor");
});

test("the About page says where to report an error and how to reach the author", async ({ page }) => {
  await page.goto("/about/");
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "rich@publicsource.org" })).toHaveAttribute("href", "mailto:rich@publicsource.org");
  await expect(main.getByRole("link", { name: "max@lemaliconsulting.com" })).toHaveAttribute("href", "mailto:max@lemaliconsulting.com");
});

test("the sections the new version cut are gone", async ({ page }) => {
  await page.goto("/about/");
  const headings = await page.locator("main h2").allTextContents();
  expect(headings.map((h) => h.trim())).toEqual([
    "What is the Pittsburgh Budget Explorer?",
    "What role did AI play?",
    "Important caveats about accuracy",
    "Source data and transparency",
    "Corrections we made to the source documents",
  ]);
});

test("every page's footer names the About page by its title", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("footer").getByRole("link", { name: "About Pittsburgh Budget Explorer" }))
    .toHaveAttribute("href", "/about/");
});
