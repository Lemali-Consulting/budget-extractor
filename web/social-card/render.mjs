/**
 * Renders the site-wide social card (site-card.html) to public/social-card.png,
 * the image every page names in its og:image and twitter:image tags.
 * Run with `npm run social-card` after changing the card; commit the PNG.
 */
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SOCIAL_CARD } from '../src/lib/social-card.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, 'site-card.html');
const OUTPUT = join(HERE, '..', 'public', SOCIAL_CARD.path.slice(1));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: SOCIAL_CARD.width, height: SOCIAL_CARD.height } });
  await page.goto(pathToFileURL(SOURCE).href);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#card').screenshot({ path: OUTPUT });
  console.log(`Wrote ${OUTPUT}`);
} finally {
  await browser.close();
}
