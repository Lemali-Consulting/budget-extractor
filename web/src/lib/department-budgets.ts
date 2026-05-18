// Helpers for working with department-budgets.json rows, which carry a `fund`
// tag separating the operating budget from trust/special-revenue funds.

export type FundType = 'operating' | 'trust' | 'other';

export interface DeptBudgetRow {
  department: string;
  slug: string;
  year: string;
  amount: number;
  fund: FundType;
}

/** Rows for the operating budget proper (excludes trust funds and appendices). */
export function operating(rows: DeptBudgetRow[]): DeptBudgetRow[] {
  return rows.filter((r) => r.fund === 'operating');
}

/** Rows for trust / special-revenue funds. */
export function trust(rows: DeptBudgetRow[]): DeptBudgetRow[] {
  return rows.filter((r) => r.fund === 'trust');
}

/** Sum of all rows matching a given fund type and year (e.g. '2026 Budget'). */
export function sumFor(rows: DeptBudgetRow[], fund: FundType, year: string): number {
  return rows
    .filter((r) => r.fund === fund && r.year === year)
    .reduce((s, r) => s + r.amount, 0);
}
