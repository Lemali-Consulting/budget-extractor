/**
 * Schema.org structured data for a page: tells search engines and Parse.ly
 * that it is a web page of the Pittsburgh Budget Explorer, published by
 * Public Source.
 */

import { SITE_NAME, SITE_URL, PUBLISHER } from './site.mjs';

const SCHEMA_CONTEXT = 'https://schema.org';

interface PageFacts {
  name: string;
  description: string;
  /** The page's canonical, absolute address. */
  url: string;
}

/**
 * The page's JSON-LD, ready to place inside a `<script type="application/ld+json">`.
 * `<` is escaped so no text in the data can close the script element early.
 */
export function structuredPageData(page: PageFacts): string {
  const publisher = { '@type': 'Organization', name: PUBLISHER.name, url: PUBLISHER.url };
  const data = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebPage',
    name: page.name,
    description: page.description,
    url: page.url,
    inLanguage: 'en-US',
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/`, publisher },
    publisher,
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
