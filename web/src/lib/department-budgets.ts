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

/** One trust fund's budget in the headline year and the year before. */
export interface TrustFundLine {
  department: string;
  slug: string;
  current: number | null;
  prior: number | null;
}

/**
 * Per-fund amounts behind the trust-fund total. The budget document never
 * prints a combined total, so readers need these to check our sum.
 * `funds` (largest first) sum to `total`; `unfunded` are funds budgeted in the
 * prior year but not this one.
 */
export function trustFundBreakdown(
  rows: DeptBudgetRow[],
  columns: { budget: string; priorBudget: string },
): { funds: TrustFundLine[]; unfunded: TrustFundLine[]; total: number } {
  const bySlug = new Map<string, TrustFundLine>();
  for (const r of trust(rows)) {
    const line = bySlug.get(r.slug) ?? { department: r.department, slug: r.slug, current: null, prior: null };
    if (r.year === columns.budget) line.current = r.amount;
    if (r.year === columns.priorBudget) line.prior = r.amount;
    bySlug.set(r.slug, line);
  }
  const lines = [...bySlug.values()];
  const funds = lines.filter((l) => l.current !== null).sort((a, b) => b.current! - a.current!);
  const unfunded = lines.filter((l) => l.current === null && l.prior !== null);
  return { funds, unfunded, total: sumFor(rows, 'trust', columns.budget) };
}

/** Sum of all rows matching a given fund type and year (e.g. '2026 Budget'). */
export function sumFor(rows: DeptBudgetRow[], fund: FundType, year: string): number {
  return rows
    .filter((r) => r.fund === fund && r.year === year)
    .reduce((s, r) => s + r.amount, 0);
}
