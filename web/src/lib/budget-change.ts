/**
 * How a department page headlines its change from the prior year's budget.
 *
 * A percentage reads well until the prior year is near zero: the Office of
 * Community Health and Safety went from $58,000 to $4.1M, "+7027.3%", which
 * Public Source's fact-check found strange (Rich's factcheck sheet "1126",
 * row 42). Past a threshold the headline gives the dollars instead, and says
 * what it grew from.
 */
import { formatDollar } from './currency';

/** Beyond this change, a percentage says little more than that the prior year was small. */
export const EXTREME_CHANGE_PERCENT = 500;

const PERCENT_DIGITS = 1;

export interface HeadlineChange {
  /** The big figure: "+3.3%", or "+$4.1M" for an extreme change. */
  value: string;
  /** The line beneath it: the dollar change, or what an extreme change grew from. */
  detail: string;
  isIncrease: boolean;
}

export function headlineChange(opts: { current: number; prior: number }): HeadlineChange {
  const { current, prior } = opts;
  const change = current - prior;
  const isIncrease = change >= 0;
  const sign = isIncrease ? '+' : '-';
  const percent = prior > 0 ? (change / prior) * 100 : Infinity;
  if (Math.abs(percent) > EXTREME_CHANGE_PERCENT) {
    return { value: `${sign}${formatDollar(Math.abs(change))}`, detail: `from ${formatDollar(prior)}`, isIncrease };
  }
  return { value: `${sign}${Math.abs(percent).toFixed(PERCENT_DIGITS)}%`, detail: formatDollar(Math.abs(change)), isIncrease };
}
