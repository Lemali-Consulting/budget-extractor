/**Color palette for budget balls visualization — 15 distinct colors for department/category clusters.*/

/** 15 visually distinct colors for cluster assignment. Departments/categories cycle through these. */
export const BALL_PALETTE = [
  '#2563eb', // blue-600
  '#dc2626', // red-600
  '#16a34a', // green-600
  '#9333ea', // purple-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#ca8a04', // yellow-600
  '#db2777', // pink-600
  '#4f46e5', // indigo-600
  '#059669', // emerald-600
  '#e11d48', // rose-600
  '#7c3aed', // violet-600
  '#0d9488', // teal-600
  '#d97706', // amber-600
  '#6366f1', // indigo-500
] as const;

/** "Other" cluster color — a muted gray. */
export const OTHER_COLOR = '#9ca3af'; // gray-400

/**
 * Assign colors to items by index, cycling through the palette.
 * The "Other" group always gets OTHER_COLOR.
 */
export function assignColor(index: number, isOther: boolean): string {
  if (isOther) return OTHER_COLOR;
  return BALL_PALETTE[index % BALL_PALETTE.length];
}
