/**
 * getStaticPaths helpers shared by the headline routes and the year-prefixed
 * archive routes, so both enumerate slugs the same way for a given BudgetYear.
 */

import { type BudgetYear, ARCHIVE_YEARS } from './budget-year';

interface SlugRef {
  slug: string;
  title: string;
}

interface StaticPath<Props> {
  params: Record<string, string>;
  props: Props;
}

interface SectionPathProps {
  budgetYear: BudgetYear;
  section: any;
  prev: SlugRef | null;
  next: SlugRef | null;
}

function withNeighbors(opts: { budgetYear: BudgetYear; sections: any[] }): StaticPath<SectionPathProps>[] {
  const { budgetYear, sections } = opts;
  const ref = (s: any): SlugRef => ({ slug: s.slug, title: s.title });
  return sections.map((s, i) => ({
    params: { slug: s.slug },
    props: {
      budgetYear,
      section: s,
      prev: i > 0 ? ref(sections[i - 1]) : null,
      next: i < sections.length - 1 ? ref(sections[i + 1]) : null,
    },
  }));
}

/** One path per operating section of the year. */
export function sectionStaticPaths(budgetYear: BudgetYear): StaticPath<SectionPathProps>[] {
  return withNeighbors({ budgetYear, sections: budgetYear.operating.sections });
}

/** One path per capital project of the year. */
export function capitalStaticPaths(budgetYear: BudgetYear): StaticPath<SectionPathProps>[] {
  return withNeighbors({ budgetYear, sections: budgetYear.capital.sections });
}

/** One path per operating department that has a current-year budget row. */
export function departmentStaticPaths(budgetYear: BudgetYear): StaticPath<{ budgetYear: BudgetYear }>[] {
  const slugs = new Set(
    budgetYear.views.departmentBudgets
      .filter((r) => r.year === budgetYear.columns.budget)
      .map((r) => r.slug),
  );
  return [...slugs].map((slug) => ({ params: { slug }, props: { budgetYear } }));
}

/** Adds the `[year]` route param to paths built for one archive year. */
export function withYearParam<Props>(opts: {
  budgetYear: BudgetYear;
  paths: StaticPath<Props>[];
}): StaticPath<Props>[] {
  const year = String(opts.budgetYear.year);
  return opts.paths.map((p) => ({ ...p, params: { ...p.params, year } }));
}

/** Paths for every archive year of a parameterless page (index, changes, ...). */
export function archiveYearStaticPaths(): StaticPath<{ budgetYear: BudgetYear }>[] {
  return ARCHIVE_YEARS.map((budgetYear) => ({
    params: { year: String(budgetYear.year) },
    props: { budgetYear },
  }));
}

/** Every archive year's paths for a slugged page type, with the `[year]` param attached. */
export function archiveSlugStaticPaths<Props>(
  build: (budgetYear: BudgetYear) => StaticPath<Props>[],
): StaticPath<Props>[] {
  return ARCHIVE_YEARS.flatMap((budgetYear) => withYearParam({ budgetYear, paths: build(budgetYear) }));
}
