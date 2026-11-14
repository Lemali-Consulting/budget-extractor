/**
 * Year registry: the one place that knows which budget years the site carries,
 * which data bundles belong to each, how they are labeled and where they live
 * in the URL space. Pages and server-side components read years, labels, route
 * prefixes and data from here instead of hardcoding them.
 *
 * Server-only (it imports the budget JSON bundles). Preact components must not
 * import this module; pages pass them labels and prefixes as props, and they use
 * `image-paths.ts` for image URLs.
 */

import { withApDates } from './ap-dates';
import headlineMeta from '../data/views/budget-meta.json';
import headlineBudget from '../data/budget-data.json';
import headlineCapital from '../data/capital-budget-data.json';
import headlineDepartmentBudgets from '../data/views/department-budgets.json';
import headlineBudgetChanges from '../data/views/budget-changes.json';
import headlinePersonnel from '../data/views/personnel.json';
import headlinePersonnelByDepartment from '../data/views/personnel-by-department.json';
import headlineSalariesAndWages from '../data/views/salaries-and-wages.json';
import headlineCapitalProjects from '../data/views/capital-projects.json';
import headlineCapitalFunding from '../data/views/capital-funding-sources.json';
import headlineCapitalAppendices from '../data/views/capital-appendices.json';
import headlineRevenueWaterfall from '../data/views/revenue-waterfall.json';
import headlineDepartmentForecast from '../data/views/department-forecast.json';
import headlineSearchIndex from '../data/views/search-index.json';
import headlineTablesIndex from '../data/views/tables-index.json';
import headlineGlossaryBacklinks from '../data/views/glossary-backlinks.json';
import headlineStructureChanges from '../data/views/structure-changes.json';
import headlineCorrections from '../data/views/corrections.json';

import meta2026 from '../data/views/2026-budget-meta.json';
import budget2026 from '../data/2026-budget-data.json';
import capital2026 from '../data/2026-capital-budget-data.json';
import departmentBudgets2026 from '../data/views/2026-department-budgets.json';
import budgetChanges2026 from '../data/views/2026-budget-changes.json';
import personnel2026 from '../data/views/2026-personnel.json';
import personnelByDepartment2026 from '../data/views/2026-personnel-by-department.json';
import salariesAndWages2026 from '../data/views/2026-salaries-and-wages.json';
import capitalProjects2026 from '../data/views/2026-capital-projects.json';
import capitalFunding2026 from '../data/views/2026-capital-funding-sources.json';
import capitalAppendices2026 from '../data/views/2026-capital-appendices.json';
import revenueWaterfall2026 from '../data/views/2026-revenue-waterfall.json';
import departmentForecast2026 from '../data/views/2026-department-forecast.json';
import searchIndex2026 from '../data/views/2026-search-index.json';
import tablesIndex2026 from '../data/views/2026-tables-index.json';
import glossaryBacklinks2026 from '../data/views/2026-glossary-backlinks.json';
import amendmentChanges2026 from '../data/views/2026-amendment-changes.json';
import amendmentCellDiffs2026 from '../data/views/2026-amendment-cell-diffs.json';
import adoptedPages2026 from '../data/views/2026-adopted-pages.json';
import corrections2026 from '../data/views/2026-corrections.json';

import meta2025 from '../data/views/2025-budget-meta.json';
import budget2025 from '../data/2025-budget-data.json';
import capital2025 from '../data/2025-capital-budget-data.json';
import departmentBudgets2025 from '../data/views/2025-department-budgets.json';
import budgetChanges2025 from '../data/views/2025-budget-changes.json';
import personnel2025 from '../data/views/2025-personnel.json';
import personnelByDepartment2025 from '../data/views/2025-personnel-by-department.json';
import salariesAndWages2025 from '../data/views/2025-salaries-and-wages.json';
import capitalProjects2025 from '../data/views/2025-capital-projects.json';
import capitalFunding2025 from '../data/views/2025-capital-funding-sources.json';
import revenueWaterfall2025 from '../data/views/2025-revenue-waterfall.json';
import departmentForecast2025 from '../data/views/2025-department-forecast.json';
import searchIndex2025 from '../data/views/2025-search-index.json';
import tablesIndex2025 from '../data/views/2025-tables-index.json';
import glossaryBacklinks2025 from '../data/views/2025-glossary-backlinks.json';

import type { DeptBudgetRow } from './department-budgets';
import type { SourceCorrection } from './corrections';
import type { SalariesAndWages } from './personnel';
import { properNameCase, sectionDisplayTitle, sentenceCase } from './text-case';
import { classifyPdfHeading, isSubclassChartLegend, isSubclassChartLegendTable } from './pdf-headings';
import { OMISSIONS_2027, withOmissions, type Omission } from './omitted-content';
import { isCoverPage } from './pdf-pages';
import { capitalProjectName } from './capital-project-names';

// ---------------------------------------------------------------------------
// Constants (defined once; everything else references these)
// ---------------------------------------------------------------------------

/** Budget document variants, matching the Python pipeline's variant names. */
export const VARIANT = {
  PROPOSED: 'proposed',
  ADOPTED: 'adopted',
  AMENDED: 'amended',
} as const;
export type Variant = (typeof VARIANT)[keyof typeof VARIANT];

/** Route prefix of the headline (unprefixed) budget pages. */
export const HEADLINE_ROUTE_PREFIX = '';

/** Where a year's budget-content pages live: at the site root, in the archive or nowhere. */
export const YEAR_ROLE = {
  HEADLINE: 'headline',
  ARCHIVE: 'archive',
  /** Data only; used by comparison pages, no browsable pages of its own. */
  COMPARISON_ONLY: 'comparison-only',
} as const;
export type YearRole = (typeof YEAR_ROLE)[keyof typeof YEAR_ROLE];

/** Site path of the 2026 amendments comparison page. */
export const AMENDMENTS_PATH = '/amendments/';

/** Dates of the two 2026 operating documents compared on amendment features. */
const AMENDMENT_ADOPTED_DATE = 'Dec 2025';
const AMENDMENT_AMENDED_DATE = 'Apr 2026';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BudgetMeta {
  year: number;
  priorYear: number;
  operatingVariant: Variant;
  capitalVariant: Variant;
}

/** Per-table cell diffs between the adopted and amended operating documents. */
export interface AmendmentCellDiffs {
  meta?: { amendmentLabel?: string; changedLineItemCount?: number };
  byTable?: Record<string, any>;
}

/** Amendment (adopted vs amended) data and labels; present only on years that were amended. */
export interface AmendmentInfo {
  /** Document label from the amended PDF, e.g. "as amended 4-20-26". */
  documentLabel: string;
  adoptedDate: string;
  amendedDate: string;
  /** e.g. "Adopted (Dec 2025)" */
  adoptedLabel: string;
  /** e.g. "Amended (Apr 2026)" */
  amendedLabel: string;
  changes: any;
  cellDiffs: AmendmentCellDiffs;
  /** {slug: [pages]} of pages with an adopted (pre-amendment) source image. */
  adoptedPages: Record<string, number[]>;
  /** Site path of the amendments comparison page. */
  path: string;
}

/** Header strings used by the extracted tables and department view for a year. */
export interface YearColumns {
  /** e.g. "2027 Budget" */
  budget: string;
  /** e.g. "2026 Budget" */
  priorBudget: string;
  /** e.g. "2027 FTE" */
  fte: string;
  /** e.g. "2026 FTE" */
  priorFte: string;
}

/** Derived views for one year. */
export interface YearViews {
  departmentBudgets: DeptBudgetRow[];
  budgetChanges: any;
  personnel: any[];
  personnelByDepartment: any[];
  /** The printed General Fund salaries-and-wages line; null if the document has none. */
  salariesAndWages: SalariesAndWages | null;
  capitalProjects: any[];
  capitalFundingSources: any[];
  revenueWaterfall: any[];
  departmentForecast: any[];
  searchIndex: any[];
  tablesIndex: any[];
  glossaryBacklinks: Record<string, any>;
}

export interface BudgetYear {
  year: number;
  priorYear: number;
  operatingVariant: Variant;
  capitalVariant: Variant;
  role: YearRole;
  /** True for the year the unprefixed site pages show. */
  isHeadline: boolean;
  /** "" for the headline, "/2026" for the archive; no trailing slash. */
  routePrefix: string;
  /** Long label, e.g. "2027 Proposed" or "2026 Budget (as amended)". */
  label: string;
  /** Short label, e.g. "2027 Proposed" or "2026 Budget". */
  shortLabel: string;
  /** Fiscal-year label for prose, e.g. "FY2027 Proposed" or "FY2026". */
  fiscalLabel: string;
  /** The budget's name as a heading, e.g. "Proposed 2027 budget" or "2026 budget (as amended)". */
  budgetName: string;
  /** The source documents as named mid-sentence, e.g. "proposed 2027 operating and capital budgets". */
  documentsName: string;
  /** Each budget as named mid-sentence, e.g. "proposed 2027 operating budget". */
  operatingName: string;
  capitalName: string;
  /** What the prior year is called, e.g. "2026 Budget". */
  priorLabel: string;
  /** Year-over-year wording, e.g. "2027 Proposed vs 2026 Budget". */
  comparisonLabel: string;
  /** Short year-over-year range for headings, e.g. "2026 → 2027". */
  rangeLabel: string;
  columns: YearColumns;
  operating: { sections: any[]; glossary: Record<string, string> };
  capital: { sections: any[] };
  views: YearViews;
  /** Capital appendices (absent for years without them). */
  capitalAppendices: any | null;
  /** Year-over-year structure changes (department adds/removals), headline only. */
  structureChanges: any | null;
  /** Labelling errors in the source PDF that we corrected when building the data (empty for most years). */
  corrections: SourceCorrection[];
  /** Amendment features apply to this year. */
  hasAmendments: boolean;
  amendment: AmendmentInfo | null;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function describeVariant(opts: { year: number; variant: Variant }): {
  label: string;
  shortLabel: string;
  fiscalLabel: string;
  budgetName: string;
  documentsName: string;
  operatingName: string;
  capitalName: string;
} {
  const { year, variant } = opts;
  if (variant === VARIANT.PROPOSED) {
    return {
      label: `${year} proposed`,
      shortLabel: `${year} proposed`,
      fiscalLabel: `FY${year} proposed`,
      budgetName: `Proposed ${year} budget`,
      documentsName: `proposed ${year} operating and capital budgets`,
      operatingName: `proposed ${year} operating budget`,
      capitalName: `proposed ${year} capital budget`,
    };
  }
  if (variant === VARIANT.AMENDED) {
    return {
      label: `${year} budget (as amended)`,
      shortLabel: `${year} budget`,
      fiscalLabel: `FY${year}`,
      budgetName: `${year} budget (as amended)`,
      documentsName: `${year} operating (as amended) and capital budgets`,
      operatingName: `${year} operating budget (as amended)`,
      capitalName: `${year} capital budget`,
    };
  }
  return { label: `${year} budget`, shortLabel: `${year} budget`, fiscalLabel: `FY${year}`, budgetName: `${year} budget`,
    documentsName: `${year} operating and capital budgets`,
    operatingName: `${year} operating budget`,
    capitalName: `${year} capital budget`,
  };
}

function buildAmendment(opts: {
  changes: any;
  cellDiffs: AmendmentCellDiffs;
  adoptedPages: Record<string, number[]>;
}): AmendmentInfo {
  return {
    documentLabel: opts.cellDiffs.meta?.amendmentLabel || 'as amended',
    adoptedDate: AMENDMENT_ADOPTED_DATE,
    amendedDate: AMENDMENT_AMENDED_DATE,
    adoptedLabel: `Adopted (${AMENDMENT_ADOPTED_DATE})`,
    amendedLabel: `Amended (${AMENDMENT_AMENDED_DATE})`,
    changes: opts.changes,
    cellDiffs: opts.cellDiffs,
    adoptedPages: opts.adoptedPages,
    path: AMENDMENTS_PATH,
  };
}

/**
 * Give each section the title the site shows, in Public Source's sentence-case
 * style, keeping the PDF's own wording in `pdf_title`. Capital project pages
 * (which carry a functional area) take their hand-written display names.
 */
function withDisplayTitles<T extends { sections: any[] }>(opts: { bundle: T; departmentSlugs: Set<string> }): T {
  const { bundle, departmentSlugs } = opts;
  return {
    ...bundle,
    sections: bundle.sections.map(withApDatesInText).map((s) =>
      s.functional_area
        ? { ...s, pdf_title: s.title, title: capitalProjectName(s.title), functional_area: sentenceCase(s.functional_area), department: s.department && properNameCase(s.department), project_type: s.project_type && sentenceCase(s.project_type) }
        : withPdfHeadings({ ...s, pdf_title: s.title, title: sectionDisplayTitle({ title: s.title, isDepartment: departmentSlugs.has(s.slug) }) }),
    ),
  };
}

/** The role the extractor gives each kind of PDF text block. */
const BLOCK_ROLE = { SECTION_TITLE: 'section_title', NARRATIVE: 'narrative', FOOTNOTE: 'footnote' } as const;

/** Where each kind of "section title" block ends up: headings re-cased, notes as small print, chart scraps dropped. */
const ROLE_FOR_HEADING_KIND = { heading: BLOCK_ROLE.SECTION_TITLE, note: BLOCK_ROLE.FOOTNOTE, prose: BLOCK_ROLE.NARRATIVE } as const;

/**
 * The section's PDF headings in house style (keeping the printed text in `pdf_text`), without its cover page,
 * the scraps of its subclass pie chart, or a heading the PDF repeats where a table continues onto the next page.
 */
function withPdfHeadings(section: any): any {
  const headingSection = { pdfTitle: section.pdf_title, title: section.title };
  let previousHeading = '';
  const recast = (block: any): any[] => {
    if (block.role === BLOCK_ROLE.NARRATIVE && isSubclassChartLegend(block.text)) return [];
    if (block.role !== BLOCK_ROLE.SECTION_TITLE) return [block];
    const heading = classifyPdfHeading({ text: block.text, section: headingSection });
    if (heading.kind === 'chart-scrap') return [];
    if (heading.kind === 'heading') {
      if (heading.text === previousHeading) return [];
      previousHeading = heading.text;
    }
    return [{ ...block, pdf_text: block.text, text: heading.text, role: ROLE_FOR_HEADING_KIND[heading.kind] }];
  };
  const tables = (section.tables ?? []).filter((t: any) => !isSubclassChartLegendTable(t));
  const tablePages = new Set<number>(tables.map((t: any) => t.relative_page));
  return {
    ...section,
    tables,
    page_content: (section.page_content ?? [])
      .filter((page: any) => !isCoverPage({ page, tablePages }))
      .map((page: any) => ({ ...page, text_blocks: (page.text_blocks ?? []).flatMap(recast) })),
  };
}

/** The section's reproduced PDF text (prose and tables) with dates in AP style. */
function withApDatesInText(section: any): any {
  return { ...section, page_content: withApDates(section.page_content), tables: withApDates(section.tables) };
}

/** Carry the sections' display titles into the generated indexes that repeat them. */
function withDisplayTitlesInViews(opts: { views: YearViews; titleBySlug: Map<string, string> }): YearViews {
  const { views, titleBySlug } = opts;
  const titleFor = (slug: string, fallback: string): string => titleBySlug.get(slug) ?? fallback;
  const glossaryBacklinks = Object.fromEntries(
    Object.entries(views.glossaryBacklinks).map(([key, entry]: [string, any]) => [
      key,
      { ...entry, sections: entry.sections.map((sec: any) => ({ ...sec, title: titleFor(sec.slug, sec.title) })) },
    ]),
  );
  return {
    ...views,
    capitalProjects: views.capitalProjects.map((p: any) => ({
      ...p,
      title: titleFor(p.slug, capitalProjectName(p.title)),
      functionalArea: p.functionalArea && sentenceCase(p.functionalArea),
      projectType: p.projectType && sentenceCase(p.projectType),
      department: p.department && properNameCase(p.department),
    })),
    capitalFundingSources: views.capitalFundingSources.map((r: any) => ({ ...r, project: capitalProjectName(r.project) })),
    // The index repeats each table's label and headers, so its dates are restyled like the tables'.
    tablesIndex: views.tablesIndex.map((t: any) => ({
      ...t,
      sectionTitle: titleFor(t.sectionSlug, t.sectionTitle),
      label: withApDates(t.label),
      headers: withApDates(t.headers),
    })),
    searchIndex: views.searchIndex.map((e: any) => ({ ...e, sectionTitle: titleFor(e.slug, e.sectionTitle) })),
    glossaryBacklinks,
  };
}

function buildYear(opts: {
  meta: BudgetMeta;
  role: YearRole;
  operating: BudgetYear['operating'];
  capital: BudgetYear['capital'];
  views: YearViews;
  capitalAppendices?: any | null;
  structureChanges?: any | null;
  corrections?: SourceCorrection[];
  /** Fragments of the extraction the site leaves out (see omitted-content.ts). */
  omissions?: readonly Omission[];
  amendment?: AmendmentInfo | null;
}): BudgetYear {
  const { meta, role } = opts;
  const { year, priorYear } = meta;
  const names = describeVariant({ year, variant: meta.operatingVariant });
  const priorLabel = `${priorYear} budget`;
  const operating = withDisplayTitles({ bundle: withOmissions({ bundle: opts.operating, omissions: opts.omissions ?? [] }), departmentSlugs: new Set(opts.views.departmentBudgets.map((r) => r.slug)) });
  const capital = withDisplayTitles({ bundle: opts.capital, departmentSlugs: new Set() });
  const titleBySlug = new Map<string, string>(
    [...operating.sections, ...capital.sections].map((sec: any) => [sec.slug, sec.title]),
  );
  return {
    year,
    priorYear,
    operatingVariant: meta.operatingVariant,
    capitalVariant: meta.capitalVariant,
    role,
    isHeadline: role === YEAR_ROLE.HEADLINE,
    routePrefix: role === YEAR_ROLE.ARCHIVE ? `/${year}` : HEADLINE_ROUTE_PREFIX,
    ...names,
    priorLabel,
    comparisonLabel: `${names.shortLabel} vs ${priorLabel}`,
    rangeLabel: `${priorYear} → ${year}`,
    columns: {
      budget: `${year} Budget`,
      priorBudget: `${priorYear} Budget`,
      fte: `${year} FTE`,
      priorFte: `${priorYear} FTE`,
    },
    operating,
    capital,
    views: withDisplayTitlesInViews({ views: opts.views, titleBySlug }),
    capitalAppendices: opts.capitalAppendices ?? null,
    structureChanges: opts.structureChanges ?? null,
    corrections: opts.corrections ?? [],
    hasAmendments: !!opts.amendment,
    amendment: opts.amendment ?? null,
  };
}

// ---------------------------------------------------------------------------
// Years
// ---------------------------------------------------------------------------

const YEAR_2027: BudgetYear = buildYear({
  meta: headlineMeta as BudgetMeta,
  role: YEAR_ROLE.HEADLINE,
  operating: headlineBudget as BudgetYear['operating'],
  capital: headlineCapital as BudgetYear['capital'],
  views: {
    departmentBudgets: headlineDepartmentBudgets as DeptBudgetRow[],
    budgetChanges: headlineBudgetChanges,
    personnel: headlinePersonnel,
    personnelByDepartment: headlinePersonnelByDepartment,
    salariesAndWages: headlineSalariesAndWages as SalariesAndWages | null,
    capitalProjects: headlineCapitalProjects,
    capitalFundingSources: headlineCapitalFunding,
    revenueWaterfall: headlineRevenueWaterfall,
    departmentForecast: headlineDepartmentForecast,
    searchIndex: headlineSearchIndex,
    tablesIndex: headlineTablesIndex,
    glossaryBacklinks: headlineGlossaryBacklinks,
  },
  capitalAppendices: headlineCapitalAppendices,
  structureChanges: headlineStructureChanges,
  corrections: headlineCorrections as SourceCorrection[],
  omissions: OMISSIONS_2027,
});

const YEAR_2026: BudgetYear = buildYear({
  meta: meta2026 as BudgetMeta,
  role: YEAR_ROLE.ARCHIVE,
  operating: budget2026 as BudgetYear['operating'],
  capital: capital2026 as BudgetYear['capital'],
  views: {
    departmentBudgets: departmentBudgets2026 as DeptBudgetRow[],
    budgetChanges: budgetChanges2026,
    personnel: personnel2026,
    personnelByDepartment: personnelByDepartment2026,
    salariesAndWages: salariesAndWages2026 as SalariesAndWages | null,
    capitalProjects: capitalProjects2026,
    capitalFundingSources: capitalFunding2026,
    revenueWaterfall: revenueWaterfall2026,
    departmentForecast: departmentForecast2026,
    searchIndex: searchIndex2026,
    tablesIndex: tablesIndex2026,
    glossaryBacklinks: glossaryBacklinks2026,
  },
  capitalAppendices: capitalAppendices2026,
  corrections: corrections2026 as SourceCorrection[],
  amendment: buildAmendment({
    changes: amendmentChanges2026,
    cellDiffs: amendmentCellDiffs2026 as AmendmentCellDiffs,
    adoptedPages: adoptedPages2026 as Record<string, number[]>,
  }),
});

const YEAR_2025: BudgetYear = buildYear({
  meta: meta2025 as BudgetMeta,
  role: YEAR_ROLE.COMPARISON_ONLY,
  operating: budget2025 as BudgetYear['operating'],
  capital: capital2025 as BudgetYear['capital'],
  views: {
    departmentBudgets: departmentBudgets2025 as DeptBudgetRow[],
    budgetChanges: budgetChanges2025,
    personnel: personnel2025,
    personnelByDepartment: personnelByDepartment2025,
    salariesAndWages: salariesAndWages2025 as SalariesAndWages | null,
    capitalProjects: capitalProjects2025,
    capitalFundingSources: capitalFunding2025,
    revenueWaterfall: revenueWaterfall2025,
    departmentForecast: departmentForecast2025,
    searchIndex: searchIndex2025,
    tablesIndex: tablesIndex2025,
    glossaryBacklinks: glossaryBacklinks2025,
  },
});

/** Every year the site carries data for, keyed by year. */
export const BUDGET_YEARS: Record<number, BudgetYear> = {
  [YEAR_2027.year]: YEAR_2027,
  [YEAR_2026.year]: YEAR_2026,
  [YEAR_2025.year]: YEAR_2025,
};

/** The year the unprefixed pages show (2027 proposed). */
export const HEADLINE: BudgetYear = YEAR_2027;

/**
 * Years browsable under their own route prefix (e.g. /2026/...). Empty: the
 * site publishes the 2027 proposed budget only (see
 * docs/decisions/2026-11-12-publish-2027-only.md). Add a year back here to
 * republish its archive.
 */
export const ARCHIVE_YEARS: BudgetYear[] = [];

/** The 2026 budget (operating as amended, capital adopted). Not published while ARCHIVE_YEARS is empty. */
export const BUDGET_2026: BudgetYear = YEAR_2026;

/** The 2025 budget bundle, kept for cross-year comparisons; not published. */
export const BUDGET_2025: BudgetYear = YEAR_2025;

// ---------------------------------------------------------------------------
// Link helpers
// ---------------------------------------------------------------------------

/** Prefix a site path (e.g. "/sections/x/") with a year's route prefix. */
export function yearPath(opts: { budgetYear: BudgetYear; path: string }): string {
  return `${opts.budgetYear.routePrefix}${opts.path}`;
}

/** Same page in the headline version of the site (a path as written without a prefix). */
export function headlinePath(path: string): string {
  return `${HEADLINE_ROUTE_PREFIX}${path}`;
}
