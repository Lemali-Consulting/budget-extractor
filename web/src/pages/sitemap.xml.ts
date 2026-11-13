/**Sitemap for search engines: every published page, at its production address.*/
import type { APIRoute } from 'astro';
import { HEADLINE } from '../lib/budget-year';
import { publishedPagePaths } from '../lib/published-pages';

export const GET: APIRoute = ({ site }) => {
  const entries = publishedPagePaths(HEADLINE)
    .map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
