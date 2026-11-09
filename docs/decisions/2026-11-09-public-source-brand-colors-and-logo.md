# Apply Public Source brand colors, logo and lookalike fonts

**Date:** 2026-11-09
**Status:** accepted

## Context

Public Source supplied its 2025 brand guidelines (palette, Mallory Condensed / Calluna Sans / Ohno Fatface, black and white logos) for this site. Max asked to start on colors and logo while the font question is put to Public Source (2026-11-09).

The supplied font files carry desktop licenses that forbid styling website text with `@font-face`: the Frere-Jones Type EULA requires a separate Web Font license (WOFF/WOFF2 files only), and the exljbris license allows `@font-face` only for free fonts. Both do allow fixed-size images made with the fonts (graphics, social cards, a pre-rendered wordmark). publicsource.org serves byte-identical copies of the desktop `.otf` files, which does not show that a web license exists. Max decided (2026-11-09) to use free lookalikes for live text and keep the real faces to images.

## Decision

- **Brand colors defined once** in `web/src/lib/brand-colors.mjs`, registered in Tailwind as the `ps` group (`ps-blue-*`, `ps-red-*`, `ps-yellow-*`, `ps-ink`, `ps-sky`, `ps-cream`, `ps-indigo`) and imported by the chart color modules.
- **Scales replace Tailwind's blue, red and amber step for step.** Each step keeps Tailwind's lightness and saturation and takes the Public Source hue, solved to the same luminance, so every text/background pair keeps the contrast it had. The guide's swatches sit on their nearest steps (light blue = blue-50, red #B21617 = red-700, yellows = yellow-100/200). Dark yellow steps (600+) fade to warm ink rather than olive.
- **PS Blue #1277E2 is not used for body text or links**: it is 4.41:1 on white, under WCAG AA's 4.5:1. Links use blue-600 (#046BD1, 5.2:1).
- **Every blue/red/amber utility class and hard-coded chart hex** was moved to its brand equivalent (438 classes, 35 hex values). Green, cyan, slate, purple and the other families are untouched: the palette has no green, so increases stay green and decreases use brand red.
- **Header**: Public Source ink (#121212) with the white logo beside "Budget Explorer", gray nav text, the brand's pale yellow (#F0EF97) underlining the current page. Favicon is "PS" on PS Blue (the guide allows "PS" as in the logo).
- **Fonts: free lookalikes for live text, real faces only in images.** Headlines (h1, h2; Tailwind `font-display`) use Fira Sans Extra Condensed in place of Mallory Condensed, which it matched most closely in width and letterform among the free condensed faces compared (Fira Sans Condensed, Barlow Condensed, Sofia Sans Condensed, Archivo Narrow). Body text (`font-sans`) uses Alegreya Sans in place of Calluna Sans, which beat Source Sans 3, Fira Sans, Lato and PT Sans for its calligraphic stress. Both are OFL, self-hosted through Fontsource, so no request goes to Google; the old Inter link is gone. Alegreya Sans defaults to old-style figures, so the body turns on lining figures as a font feature, which Tailwind's `tabular-nums` can't override. Charts follow the page font. Stacks live in `web/src/lib/brand-fonts.mjs`.
- **Header wordmark** "Budget Explorer" is a fixed-size PNG set in Mallory Condensed Black (alt text "Budget Explorer"), which the desktop licenses allow. On the story layout the nav wraps below the logo on phones.
- **Footer "Built by Lemali" kept.** Page titles still read "Pittsburgh Budget Explorer".

## Open

- Fonts: if Public Source holds web licenses for Mallory Condensed and Calluna Sans, swap the stacks in `brand-fonts.mjs` for the real faces.
- Whether the site becomes a Public Source product or stays co-branded (affects the site name, "Pittsburgh's Public Source" on first reference, and the footer).
- Whether increases should leave green for a brand color.
