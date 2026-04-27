/**Per-source color palettes for the Money Flow Sankey diagrams.
 * Colors are propagated from source nodes through links, so destination
 * (trunk / department / project / year) nodes stay neutral. */

// Revenue categories — keyed by the labels in revenue-waterfall.json.
// Hand-picked from the Tailwind palette to be distinct and on-brand.
export const REVENUE_COLORS: Record<string, string> = {
  'Tax Revenue': '#1d4ed8',              // blue-700 (largest, anchor)
  'Intergovernmental Revenue': '#0891b2', // cyan-600
  'Charges For Services': '#16a34a',     // green-600
  'Licenses & Permits Revenue': '#f59e0b', // amber-500
  'Fines & Forfeitures': '#dc2626',      // red-600
  'Interest Earnings': '#7c3aed',        // violet-600
  'Miscellaneous Revenues': '#64748b',   // slate-500
};

// Capital funding sources — keep the existing SOURCE_COLORS in spirit
// but bump saturation slightly so they read as a coordinated set.
export const CAPITAL_SOURCE_COLORS: Record<string, string> = {
  BOND: '#1d4ed8',   // blue-700
  PAYGO: '#16a34a',  // green-600
  CDBG: '#f59e0b',   // amber-500
  OTHER: '#64748b',  // slate-500
};

export function revenueColor(label: string): string {
  return REVENUE_COLORS[label] ?? '#6b7280';
}

export function capitalSourceColor(source: string): string {
  return CAPITAL_SOURCE_COLORS[source] ?? '#6b7280';
}
