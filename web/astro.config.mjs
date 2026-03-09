import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [preact(), tailwind()],
  output: 'static',
  server: { host: '0.0.0.0' },
});
