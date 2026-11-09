/**
 * Public Source brand colors (2025 brand guidelines), defined once for the
 * Tailwind theme and for chart code.
 *
 * The blue, red and yellow scales replace Tailwind's blue, red and amber
 * step for step. Each step takes Tailwind's lightness and saturation at that
 * step and the Public Source hue, solved so its luminance matches Tailwind's —
 * so every text/background pairing keeps the contrast it had before the
 * rebrand. The guide's own swatches sit on the steps nearest them: light blue
 * #E8F1FD (blue-50), red #B21617 (red-700), yellows #F0EF97 and #EDE44A
 * (yellow-100, yellow-200). Dark yellows read as olive, so from yellow-600 up
 * the scale fades to warm ink instead.
 *
 * PS Blue itself (#1277E2) is 4.41:1 on white, just under the 4.5:1 minimum
 * for body text, so it is kept for large text, rules and fills
 * (`ps-blue` / `ps-blue-DEFAULT`); text links use blue-600 and darker.
 */

/** Exact swatches from the brand guide. */
export const PS_SWATCHES = Object.freeze({
  blue: '#1277E2',
  lightBlue: '#E8F1FD',
  paleYellow: '#F0EF97',
  ink: '#121212',
  yellow: '#EDE44A',
  sky: '#82BCF9',
  cream: '#FBF6ED',
  indigo: '#2D2CD8',
  red: '#B21617',
});

export const PS_BLUE_SCALE = Object.freeze({
  DEFAULT: PS_SWATCHES.blue,
  50: '#E8F1FD',
  100: '#DAEAFE',
  200: '#BFDAFE',
  300: '#97C4FE',
  400: '#61A4FA',
  500: '#2284F4',
  600: '#046BD1',
  700: '#025BB2',
  800: '#014A93',
  900: '#013F81',
  950: '#032852',
});

export const PS_RED_SCALE = Object.freeze({
  DEFAULT: PS_SWATCHES.red,
  50: '#FEF3F1',
  100: '#FEE3DE',
  200: '#FECBC3',
  300: '#FBA69B',
  400: '#F87265',
  500: '#EE453C',
  600: '#DC2725',
  700: '#B21617',
  800: '#991B19',
  900: '#7F1E19',
  950: '#450A08',
});

export const PS_YELLOW_SCALE = Object.freeze({
  DEFAULT: PS_SWATCHES.yellow,
  50: '#FCFCEB',
  100: '#F0EF97',
  200: '#EDE44A',
  300: '#E3DB55',
  400: '#D6CC30',
  500: '#BEB402',
  600: '#929280',
  700: '#71705F',
  800: '#5A5949',
  900: '#4A4A3A',
  950: '#282719',
});

/** The `ps` color group for the Tailwind theme: `bg-ps-blue-600`, `text-ps-ink`, … */
export const PS_TAILWIND_COLORS = Object.freeze({
  blue: PS_BLUE_SCALE,
  red: PS_RED_SCALE,
  yellow: PS_YELLOW_SCALE,
  ink: PS_SWATCHES.ink,
  sky: PS_SWATCHES.sky,
  cream: PS_SWATCHES.cream,
  indigo: PS_SWATCHES.indigo,
});
