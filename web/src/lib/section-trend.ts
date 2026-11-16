/**
 * The points a department's budget trend chart plots: one per row and year
 * column, totals left out. The PDF prints a dash where a line had no money
 * that year; the chart plots it as zero so a line funded in only some years
 * still draws as a line, not a lone dot. An empty cell stays a gap.
 */
import { parseCurrency } from './currency';

/** How the budget PDFs print "no money this year" in a figure column. */
const NO_MONEY_DASH = '—';

export interface TrendPoint {
  label: string;
  year: number;
  value: number;
}

export function trendPoints(opts: {
  rows: string[][];
  rowLabels: string[];
  yearColumns: { idx: number; year: number }[];
}): TrendPoint[] {
  const { rows, rowLabels, yearColumns } = opts;
  const points: TrendPoint[] = [];
  for (const [i, row] of rows.entries()) {
    const label = rowLabels[i];
    if (!label || label.toLowerCase().includes('total')) continue;
    for (const { idx, year } of yearColumns) {
      const value = figureOrZero(row[idx] ?? '');
      if (value !== null) points.push({ label, year, value });
    }
  }
  return points;
}

function figureOrZero(cell: string): number | null {
  return cell.trim() === NO_MONEY_DASH ? 0 : parseCurrency(cell);
}
