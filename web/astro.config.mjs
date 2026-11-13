import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
import { SITE_URL } from './src/lib/site.mjs';

export default defineConfig({
  site: SITE_URL,
  integrations: [preact(), tailwind()],
  output: 'static',
  server: { host: '0.0.0.0' },
});
