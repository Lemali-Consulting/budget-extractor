/**
 * Who and where the site is: its production address, its name and its
 * publisher, defined once for the Astro config, page metadata and embed code.
 *
 * SITE_URL is the address search engines, social previews and Parse.ly are
 * told is canonical. If the site moves to another domain, change it here and
 * every canonical link, the sitemap and robots.txt follow.
 */

export const SITE_URL = 'https://pgh-budget-explorer.netlify.app';

export const SITE_NAME = 'Pittsburgh Budget Explorer';

export const PUBLISHER = Object.freeze({
  name: 'Public Source',
  url: 'https://www.publicsource.org/',
});
