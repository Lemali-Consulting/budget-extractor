/**Per-source color palettes for the Money Flow Sankey diagrams.
 * Colors are propagated from source nodes through links, so destination
 * (trunk / department / project / year) nodes stay neutral. */
import { PS_BLUE_SCALE, PS_RED_SCALE, PS_SWATCHES, PS_YELLOW_SCALE } from './brand-colors.mjs';

// Revenue categories — keyed by the labels in revenue-waterfall.json.
// Public Source brand colors where the palette has one; green, cyan and
// slate stay from Tailwind because the brand palette has no equivalent.
export const REVENUE_COLORS: Record<string, string> = {
  'Tax revenue': PS_BLUE_SCALE[700],     // largest, anchor
  'Intergovernmental revenue': '#0891b2', // cyan-600
  'Charges for services': '#16a34a',     // green-600
  'Licenses & permits revenue': PS_YELLOW_SCALE[500],
  'Fines & forfeitures': PS_RED_SCALE[600],
  'Interest earnings': PS_SWATCHES.indigo,
  'Miscellaneous revenues': '#64748b',   // slate-500
};

// Capital funding sources — keep the existing SOURCE_COLORS in spirit
// but bump saturation slightly so they read as a coordinated set.
export const CAPITAL_SOURCE_COLORS: Record<string, string> = {
  BOND: PS_BLUE_SCALE[700],
  PAYGO: '#16a34a',  // green-600
  CDBG: PS_YELLOW_SCALE[500],
  OTHER: '#64748b',  // slate-500
};

export function revenueColor(label: string): string {
  return REVENUE_COLORS[label] ?? '#6b7280';
}

export function capitalSourceColor(source: string): string {
  return CAPITAL_SOURCE_COLORS[source] ?? '#6b7280';
}
