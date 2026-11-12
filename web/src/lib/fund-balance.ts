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
const TOTAL_REVENUES_ROW = 'Total Revenues';

interface ForecastTable {
  headers: string[];
  rows: string[][];
}

/** A forecast row's figure for the budget year, or null when the forecast doesn't print it. */
function forecastFigure(opts: { budgetYear: BudgetYear; rowName: string }): number | null {
  const { budgetYear, rowName } = opts;
  const forecast = budgetYear.operating.sections.find((s: { slug: string }) => s.slug === FORECAST_SLUG);
  for (const table of (forecast?.tables ?? []) as ForecastTable[]) {
    const column = table.headers.indexOf(budgetYear.columns.budget);
    const row = table.rows.find((r) => (r[0] ?? '').trim() === rowName);
    if (column < 0 || !row) continue;
    return parseCurrency(row[column] ?? '');
  }
  return null;
}

/** The year's use of fund balance, or null when the forecast prints none. */
export function useOfFundBalance(budgetYear: BudgetYear): number | null {
  const amount = forecastFigure({ budgetYear, rowName: USE_OF_FUND_BALANCE_ROW });
  return amount && amount > 0 ? amount : null;
}

/** The forecast's total revenues for the year, which count the use of fund balance. */
export function forecastTotalRevenues(budgetYear: BudgetYear): number | null {
  return forecastFigure({ budgetYear, rowName: TOTAL_REVENUES_ROW });
}
