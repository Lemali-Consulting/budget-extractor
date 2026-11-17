/**
 * The headline budget's summary figures, as the home page's cards and charts
 * show them. Shared by the home page and its embeddable copies so both always
 * print the same numbers.
 */
import { HEADLINE } from './budget-year';
import { operating, sumFor } from './department-budgets';

interface FundingRow {
  year: string;
  amount: number;
}

const { columns } = HEADLINE;
const { departmentBudgets, revenueWaterfall, capitalFundingSources } = HEADLINE.views;
const capitalFunding = capitalFundingSources as FundingRow[];

/** Dollars as millions with one decimal: "$727.3M". */
export function fmtM(n: number): string {
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

export const operatingTotal: number = sumFor(departmentBudgets, 'operating', columns.budget);
const operatingPriorTotal: number = sumFor(departmentBudgets, 'operating', columns.priorBudget);
/** Percent change in the operating budget from the prior year's budget. */
export const operatingChangePct: number =
  operatingPriorTotal > 0 ? ((operatingTotal - operatingPriorTotal) / operatingPriorTotal) * 100 : 0;
export const trustFundTotal: number = sumFor(departmentBudgets, 'trust', columns.budget);

export const revenueSources = revenueWaterfall as { label: string; amount: number }[];
export const revenueTotal: number = revenueSources.reduce((s, r) => s + r.amount, 0);

/** The capital budget for the headline year alone. */
export const capitalYearTotal: number = capitalFunding
  .filter((r) => r.year === String(HEADLINE.year))
  .reduce((s, r) => s + r.amount, 0);
/** The six-year capital plan, the headline year onward. */
export const capitalPlanTotal: number = capitalFunding
  .filter((r) => parseInt(r.year) >= HEADLINE.year)
  .reduce((s, r) => s + r.amount, 0);

/** Operating budget rows, one per department and year column. */
export const departmentRows = operating(departmentBudgets);
export const departmentCount: number = new Set(departmentRows.map((r) => r.slug)).size;
