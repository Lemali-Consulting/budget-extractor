/**
 * Who and where the site is: its production address, its name and its
 * publisher, defined once for the Astro config, page metadata and embed code.
 *
 * SITE_URL is the address search engines, social previews and Parse.ly are
 * told is canonical. If the site moves to another domain, change it here and
 * every canonical link, the sitemap and robots.txt follow.
 *
 * The site is hosted on Netlify and served at both budget.publicsource.org and
 * pgh-budget-explorer.netlify.app; the Public Source address is the public one.
 */

export const SITE_URL = 'https://budget.publicsource.org';

export const SITE_NAME = 'Pittsburgh Budget Explorer';

/** The About page's heading, and the footer link to it on every page. */
export const ABOUT_PAGE_TITLE = `About ${SITE_NAME}`;

export const PUBLISHER = Object.freeze({
  name: 'Public Source',
  url: 'https://www.publicsource.org/',
});
