/**
 * Spreads one column of a flow diagram's labels apart so none overlap.
 *
 * Small nodes sit closer together than a line of text is tall; their labels
 * are moved apart just enough, in their original order, and kept between
 * `min` and `max`. Labels already far enough apart don't move.
 */
export function spreadLabels(opts: { positions: number[]; minGap: number; min: number; max: number }): number[] {
  const { positions, minGap, min, max } = opts;
  const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b]);
  const placed = order.map((i) => positions[i]);
  for (let k = 1; k < placed.length; k++) placed[k] = Math.max(placed[k], placed[k - 1] + minGap);
  if (placed.length > 0) placed[placed.length - 1] = Math.min(placed[placed.length - 1], max);
  for (let k = placed.length - 2; k >= 0; k--) placed[k] = Math.min(placed[k], placed[k + 1] - minGap);
  if (placed.length > 0) placed[0] = Math.max(placed[0], min);
  const out = [...positions];
  order.forEach((i, k) => (out[i] = placed[k]));
  return out;
}
