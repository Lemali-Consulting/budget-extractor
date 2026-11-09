/**
 * Font stacks standing in for Public Source's brand faces on live web text.
 *
 * The brand faces (Mallory Condensed for headlines, Calluna Sans for body)
 * carry desktop licenses that forbid styling website text with @font-face, so
 * live text uses free (OFL) lookalikes, self-hosted via Fontsource. The real
 * faces may still appear inside fixed-size images, such as the header wordmark.
 * See docs/decisions/2026-11-09-public-source-brand-colors-and-logo.md.
 */

/** Stands in for Mallory Condensed: closest in width and letterform. */
export const HEADLINE_FONT_FAMILY = 'Fira Sans Extra Condensed';
/** Stands in for Calluna Sans: a humanist sans with the same calligraphic stress. */
export const BODY_FONT_FAMILY = 'Alegreya Sans';

const SYSTEM_SANS = ['ui-sans-serif', 'system-ui', 'sans-serif'];

export const HEADLINE_FONT_STACK = [HEADLINE_FONT_FAMILY, ...SYSTEM_SANS];
export const BODY_FONT_STACK = [BODY_FONT_FAMILY, ...SYSTEM_SANS];

/** The body stack as one CSS `font-family` value, for inline SVG text. */
export const BODY_FONT_CSS = BODY_FONT_STACK.map((f) => (f.includes(' ') ? `'${f}'` : f)).join(', ');
