/**
 * The budget's planned draw on the city's fund balance, as the five-year
 * forecast prints it ("Use of Fund Balance"). The revenue detail lists
 * revenue only, so the draw is read from the forecast.
 *
 * Rich (Public Source) asked for it on the money flow page (2026-11-12).
 */
import type { BudgetYear } from './budget-year';
import { parseCurrency } from './currency';

const FORECAST_SLUG = 'five-year-financial-forecast';
const USE_OF_FUND_BALANCE_ROW = 'Use of Fund Balance';

interface ForecastTable {
  headers: string[];
  rows: string[][];
}

/** The year's use of fund balance, or null when the forecast prints none. */
export function useOfFundBalance(budgetYear: BudgetYear): number | null {
  const forecast = budgetYear.operating.sections.find((s: { slug: string }) => s.slug === FORECAST_SLUG);
  for (const table of (forecast?.tables ?? []) as ForecastTable[]) {
    const column = table.headers.indexOf(budgetYear.columns.budget);
    const row = table.rows.find((r) => (r[0] ?? '').trim() === USE_OF_FUND_BALANCE_ROW);
    if (column < 0 || !row) continue;
    const amount = parseCurrency(row[column] ?? '');
    return amount && amount > 0 ? amount : null;
  }
  return null;
}
