import { PS_TAILWIND_COLORS } from './src/lib/brand-colors.mjs';
import { BODY_FONT_STACK, HEADLINE_FONT_STACK } from './src/lib/brand-fonts.mjs';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Public Source brand colors: `ps-blue-600`, `ps-red-700`, `ps-yellow-100`, `ps-ink`, …
      colors: { ps: PS_TAILWIND_COLORS },
      // `font-sans` is the body face; `font-display` the headline face.
      fontFamily: { sans: BODY_FONT_STACK, display: HEADLINE_FONT_STACK },
    },
  },
};
