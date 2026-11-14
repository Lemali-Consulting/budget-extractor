/**Shared color constants for Observable Plot charts and UI badges.*/
import { PS_BLUE_SCALE, PS_RED_SCALE, PS_YELLOW_SCALE } from './brand-colors.mjs';

export const CHART_COLORS = {
  primary: PS_BLUE_SCALE[600],
  // Increases are brand blue: the palette has no green (Max, 2026-11-14).
  positive: PS_BLUE_SCALE[600],
  negative: PS_RED_SCALE[600],
  neutral: '#6b7280',    // gray-500
  annotation: '#666666',
} as const;

export const SOURCE_COLORS: Record<string, string> = {
  BOND: PS_BLUE_SCALE[600],
  CDBG: PS_YELLOW_SCALE[500],
  PAYGO: '#10b981',
  OTHER: '#6b7280',
};
