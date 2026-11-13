/**robots.txt: crawlers may index the whole site, and the sitemap lists its pages.*/
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = new URL('/sitemap.xml', site).href;
  const body = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
