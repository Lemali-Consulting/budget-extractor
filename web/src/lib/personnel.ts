import { type DeptBudgetRow, operating } from './department-budgets';

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

/**
 * Full-time equivalents in General Fund departments, matching the scope of the
 * salaries-and-wages line. The budget document prints no citywide FTE total,
 * so this is our sum of each department's position table.
 */
export function generalFundFte(
  personnelByDepartment: DepartmentPersonnel[],
  departmentBudgets: DeptBudgetRow[],
): number {
  const generalFundSlugs = new Set(operating(departmentBudgets).map((r) => r.slug));
  return personnelByDepartment
    .filter((d) => generalFundSlugs.has(d.slug))
    .reduce((sum, d) => sum + d.totalFteCurrent, 0);
}
