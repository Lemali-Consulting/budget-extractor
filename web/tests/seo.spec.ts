/**
 * Search, sharing and analytics: what every published page tells search
 * engines, social previews and Public Source's readership tools.
 *
 * Public Source asked for SEO and for its Google Analytics and Parse.ly tags on
 * every page (Max, 2026-11-13). These checks read the built HTML, so they see
 * exactly what a crawler or the Parse.ly validator sees.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./test-base";
import { PUBLISHED } from "./published-pages";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
// The public address; the netlify.app one serves the same site (Max, 2026-11-13).
const SITE = "https://budget.publicsource.org";
const GA_ID = "G-CCLXQK5C14";

function builtHtml(path: string): string {
  return readFileSync(join(DIST, path, "index.html"), "utf8");
}

/** The value of the first `<meta>` or `<link>` matching `selector`'s attribute pair, decoded. */
function tagContent(html: string, opts: { tag: string; key: string; value: string; read: string }): string | undefined {
  const { tag, key, value, read } = opts;
  for (const match of html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))) {
    const element = match[0];
    if (!element.includes(`${key}="${value}"`)) continue;
    const found = element.match(new RegExp(`${read}="([^"]*)"`));
    return found?.[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  }
  return undefined;
}

test("every published page loads Public Source's Google Analytics tag", () => {
  const missing: string[] = [];
  for (const path of PUBLISHED) {
    const html = builtHtml(path);
    const loadsGtag = html.includes(`src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"`);
    const configures = html.includes(`gtag('config', '${GA_ID}')`);
    if (!loadsGtag || !configures) missing.push(path);
  }
  expect(missing).toEqual([]);
});

test("every published page loads Public Source's Parse.ly tag", () => {
  const missing = [...PUBLISHED].filter(
    (path) => !builtHtml(path).includes('<script id="parsely-cfg" src="//cdn.parsely.com/keys/publicsource.org/p.js"></script>'),
  );
  expect(missing).toEqual([]);
});

// Parse.ly and search engines both key a page on its canonical URL; a
// localhost or preview URL there splits or loses the page's numbers.
test("every published page names its production address as canonical, and shares it", () => {
  const wrong: string[] = [];
  for (const path of PUBLISHED) {
    const html = builtHtml(path);
    const canonical = tagContent(html, { tag: "link", key: "rel", value: "canonical", read: "href" });
    const ogUrl = tagContent(html, { tag: "meta", key: "property", value: "og:url", read: "content" });
    if (canonical !== `${SITE}${path}` || ogUrl !== `${SITE}${path}`) wrong.push(`${path}: ${canonical} / ${ogUrl}`);
  }
  expect(wrong).toEqual([]);
});

// Search results show the description as the snippet; one shared by many pages
// tells a reader nothing about which result to pick.
test("every published page has its own description", () => {
  const pagesByDescription = new Map<string, string[]>();
  for (const path of PUBLISHED) {
    const description = tagContent(builtHtml(path), { tag: "meta", key: "name", value: "description", read: "content" }) ?? "";
    pagesByDescription.set(description, [...(pagesByDescription.get(description) ?? []), path]);
  }
  const shared = [...pagesByDescription].filter(([, paths]) => paths.length > 1);
  expect(shared).toEqual([]);
  expect(pagesByDescription.has("")).toBe(false);
});

test("every published page carries a social preview card naming the site", () => {
  const missing: string[] = [];
  for (const path of PUBLISHED) {
    const html = builtHtml(path);
    const siteName = tagContent(html, { tag: "meta", key: "property", value: "og:site_name", read: "content" });
    const card = tagContent(html, { tag: "meta", key: "name", value: "twitter:card", read: "content" });
    if (siteName !== "Pittsburgh Budget Explorer" || !card) missing.push(path);
  }
  expect(missing).toEqual([]);
});

// Structured data tells search engines and Parse.ly what kind of page this is
// and who publishes it.
test("every published page describes itself as a web page published by Public Source", () => {
  const wrong: string[] = [];
  for (const path of PUBLISHED) {
    const block = builtHtml(path).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const data = block ? JSON.parse(block[1]) : {};
    const ok = data["@type"] === "WebPage" && data.url === `${SITE}${path}` && data.publisher?.name === "Public Source";
    if (!ok) wrong.push(path);
  }
  expect(wrong).toEqual([]);
});

test("the home page title is the site's name, not \"Home\"", () => {
  const title = builtHtml("/").match(/<title>([^<]*)<\/title>/)?.[1];
  expect(title).toBe("Pittsburgh Budget Explorer");
});

// The sitemap is how a crawler finds pages; it must list the published pages
// and nothing else.
test("the sitemap lists exactly the published pages, at their production addresses", () => {
  const xml = readFileSync(join(DIST, "sitemap.xml"), "utf8");
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(listed.sort()).toEqual([...PUBLISHED].map((path) => `${SITE}${path}`).sort());
});

test("robots.txt lets crawlers in and points them at the sitemap", () => {
  const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
  expect(robots).toMatch(/^User-agent: \*$/m);
  expect(robots).not.toMatch(/^Disallow: \/$/m);
  expect(robots).toMatch(new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, "m"));
});

// Test runs must never reach the real analytics services (see test-base.ts).
test("analytics scripts load in the browser, and tests answer them locally", async ({ page }) => {
  const bodyLengths: Promise<number>[] = [];
  page.on("response", (response) => {
    if (/googletagmanager\.com|parsely\.com/.test(response.url())) {
      bodyLengths.push(response.body().then((body) => body.length));
    }
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const lengths = await Promise.all(bodyLengths);
  expect(lengths.length).toBeGreaterThanOrEqual(2); // gtag.js and p.js were both requested
  expect(lengths.every((length) => length === 0)).toBe(true); // ...and served by the stub
});

/**
 * Shared links show one designed card for the whole site (Max chose the
 * site-wide card over per-page cards, 2026-11-17). It carries no figures, so
 * it adds nothing to the fact-check; each page's title and description still
 * appear beneath it.
 */
const SOCIAL_CARD = { path: "/social-card.png", width: 1200, height: 630 };

test("every published page shares the site-wide social card as a large image", () => {
  const imageUrl = `${SITE}${SOCIAL_CARD.path}`;
  const wrong: string[] = [];
  for (const path of PUBLISHED) {
    const html = builtHtml(path);
    const meta = (key: string, value: string) => tagContent(html, { tag: "meta", key, value, read: "content" });
    const tags = {
      ogImage: meta("property", "og:image"),
      ogWidth: meta("property", "og:image:width"),
      ogHeight: meta("property", "og:image:height"),
      ogAlt: meta("property", "og:image:alt"),
      card: meta("name", "twitter:card"),
      twitterImage: meta("name", "twitter:image"),
    };
    const ok = tags.ogImage === imageUrl && tags.twitterImage === imageUrl && tags.card === "summary_large_image"
      && tags.ogWidth === String(SOCIAL_CARD.width) && tags.ogHeight === String(SOCIAL_CARD.height) && !!tags.ogAlt;
    if (!ok) wrong.push(`${path} ${JSON.stringify(tags)}`);
  }
  expect(wrong).toEqual([]);
});

test("the social card image is built at the size its tags declare", () => {
  // A PNG's width and height sit at bytes 16-23 of its header.
  const png = readFileSync(join(DIST, SOCIAL_CARD.path));
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([SOCIAL_CARD.width, SOCIAL_CARD.height]);
});
