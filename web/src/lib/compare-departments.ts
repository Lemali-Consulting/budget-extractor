/**
 * The departments the compare page offers, with the figures it shows.
 *
 * Max, 2026-11-12: departments only, no trust funds; each department's total
 * budget, the figure its department page and the home chart show, rather than
 * the cost of its positions; no FTE change.
 */
import type { BudgetYear } from './budget-year';
import { operating, type DeptBudgetRow } from './department-budgets';
import { isDepartmentSection, sectionPageHref } from './published-pages';

export interface CompareDepartment {
  department: string;
  slug: string;
  /** Published page for the department, when there is one. */
  href: string | null;
  budgetCurrent: number;
  budgetPrior: number;
  fteCurrent: number;
  positionCount: number;
}

interface PersonnelTotals {
  slug: string;
  totalFteCurrent: number;
  positionCount: number;
}

function amountFor(rows: DeptBudgetRow[], opts: { slug: string; year: string }): number | undefined {
  return rows.find((r) => r.slug === opts.slug && r.year === opts.year)?.amount;
}

/**
 * Every department section with a budget of its own, in name order. The
 * Department of Public Works parent section has none; its bureaus carry it.
 */
export function compareDepartments(budgetYear: BudgetYear): CompareDepartment[] {
  const budgets = operating(budgetYear.views.departmentBudgets as DeptBudgetRow[]);
  const personnel = budgetYear.views.personnelByDepartment as PersonnelTotals[];
  const departments: CompareDepartment[] = [];
  for (const section of budgetYear.operating.sections) {
    if (!isDepartmentSection(section)) continue;
    const budgetCurrent = amountFor(budgets, { slug: section.slug, year: budgetYear.columns.budget });
    if (budgetCurrent === undefined) continue;
    const staff = personnel.find((p) => p.slug === section.slug);
    departments.push({
      department: section.title,
      slug: section.slug,
      href: sectionPageHref({ budgetYear, section }),
      budgetCurrent,
      budgetPrior: amountFor(budgets, { slug: section.slug, year: budgetYear.columns.priorBudget }) ?? 0,
      fteCurrent: staff?.totalFteCurrent ?? 0,
      positionCount: staff?.positionCount ?? 0,
    });
  }
  return departments.sort((a, b) => a.department.localeCompare(b.department));
}

/** Budget rows for the trend chart, limited to the departments the page offers. */
export function compareBudgetRows(budgetYear: BudgetYear): DeptBudgetRow[] {
  const slugs = new Set(compareDepartments(budgetYear).map((d) => d.slug));
  return operating(budgetYear.views.departmentBudgets as DeptBudgetRow[]).filter((r) => slugs.has(r.slug));
}
