/**Shared color constants for Observable Plot charts and UI badges.*/

export const CHART_COLORS = {
  primary: '#2563eb',    // blue-600
  positive: '#16a34a',   // green-600
  negative: '#dc2626',   // red-600
  neutral: '#6b7280',    // gray-500
  annotation: '#666666',
} as const;

export const SOURCE_COLORS: Record<string, string> = {
  BOND: '#2563eb',
  CDBG: '#f59e0b',
  PAYGO: '#10b981',
  OTHER: '#6b7280',
};
