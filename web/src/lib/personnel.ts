/**
 * The General Fund's printed "51 - Personnel-Salaries & Wages" line, read from
 * the budget document's Expenditure Summary. It includes overtime and other
 * premium pay, and covers General Fund departments only.
 */
export interface SalariesAndWages {
  current: number;
  prior: number;
  /** Absolute PDF page the line is printed on. */
  page: number;
  sectionSlug: string;
}

/** One department's totals from its position table (see build_personnel_by_department). */
export interface DepartmentPersonnel {
  slug: string;
  totalFteCurrent: number;
  totalBudgetCurrent: number;
}

// What the department and position views' salary figures cover. Each is a
// department's "Total Full-Time Positions and Net Salaries" line: budgeted
// positions and part-time pay, less the vacancy allowance. Overtime and other
// premium pay are budgeted only citywide, so these don't sum to the
// salaries-and-wages line.
export const DEPARTMENT_SALARY_SCOPE = 'Budgeted positions, net of vacancies';

/** The per-position column's header, shared by the department and explorer tables. */
export const PER_POSITION_LABEL = 'Per position';

/**
 * A position line's 2027 budget divided by its headcount, so readers needn't
 * do the division. Only whole headcounts qualify: a fractional one is a
 * part-time line or a position split between funds (the PDF's "*" titles,
 * with the split printed at the page foot), where the quotient isn't one
 * position's budget. It is an average across a title's pay steps, and runs a
 * few percent above headcount × the printed rate.
 */
export function budgetPerPosition(line: { fteCurrent: number | null; budgetCurrent: number | null }): number | null {
  const { fteCurrent, budgetCurrent } = line;
  if (!fteCurrent || !budgetCurrent || !Number.isInteger(fteCurrent)) return null;
  return budgetCurrent / fteCurrent;
}
