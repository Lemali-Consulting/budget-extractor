/**
 * getStaticPaths helpers shared by the headline routes and the year-prefixed
 * archive routes, so both enumerate slugs the same way for a given BudgetYear.
 */

import { type BudgetYear, ARCHIVE_YEARS } from './budget-year';
import { isDepartmentSection, publishedSections, sectionPageHref } from './published-pages';

/** A neighbouring page for the previous/next links. */
export interface SlugRef {
  slug: string;
  title: string;
  href: string;
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

function withNeighbors(opts: {
  budgetYear: BudgetYear;
  sections: any[];
  hrefOf: (section: any) => string;
}): StaticPath<SectionPathProps>[] {
  const { budgetYear, sections, hrefOf } = opts;
  const ref = (s: any): SlugRef => ({ slug: s.slug, title: s.title, href: hrefOf(s) });
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

/** Paths over the year's published operating sections, each linked to its published neighbours. */
function publishedSectionPaths(budgetYear: BudgetYear): StaticPath<SectionPathProps>[] {
  return withNeighbors({
    budgetYear,
    sections: publishedSections(budgetYear),
    hrefOf: (section) => sectionPageHref({ budgetYear, section })!,
  });
}

/** One /sections/ path per published section that isn't a department (departments live under /departments/). */
export function sectionStaticPaths(budgetYear: BudgetYear): StaticPath<SectionPathProps>[] {
  if (!budgetYear.isHeadline) return publishedSectionPaths(budgetYear);
  return publishedSectionPaths(budgetYear).filter((p) => !isDepartmentSection(p.props.section));
}

/** The headline's merged department pages: one per department section, with the section's content. */
export function departmentSectionStaticPaths(budgetYear: BudgetYear): StaticPath<SectionPathProps>[] {
  return publishedSectionPaths(budgetYear).filter((p) => isDepartmentSection(p.props.section));
}

/** One path per capital project of the year. */
export function capitalStaticPaths(budgetYear: BudgetYear): StaticPath<SectionPathProps>[] {
  return withNeighbors({
    budgetYear,
    sections: budgetYear.capital.sections,
    hrefOf: (s) => `${budgetYear.routePrefix}/capital/${s.slug}/`,
  });
}

/** One path per operating department that has a current-year budget row (archive one-pagers). */
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
