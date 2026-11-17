/**
 * Source corrections: labelling errors in a budget PDF that Pittsburgh Budget
 * Explorer fixes when building the data (see `utils/corrections.py`). This
 * module holds the shared types, anchors and wording so every place that
 * discloses a correction (table badge, section notice, home footnote, About
 * page) says the same thing. Pure functions; safe for any component.
 */

import { ABOUT_PATH } from './site.mjs';
import type { DeptBudgetRow } from './department-budgets';

/** Site path of the About page's corrections list. */
export const CORRECTIONS_PATH = `${ABOUT_PATH}#corrections`;

/** Fund tag, in the department-budget view, of trust funds. */
const TRUST_FUND = 'trust';

/** One corrected table, as written to `views/{prefix}corrections.json`. */
export interface SourceCorrection {
  id: string;
  section: string;
  sectionSlug: string;
  tableId: string;
  summary: string;
  evidence: string;
  /** Page of the full source PDF the table is on. */
  pdfPage: number;
  originalHeaders: string[];
  correctedHeaders: string[];
}

/** The {id, summary} reference carried by a corrected table or section in the data bundle. */
export interface CorrectionRef {
  id: string;
  summary: string;
}

/** Anchor of a correction's entry on the About page, e.g. "correction-2027-parks-tax-trust-fund-year-labels". */
export function correctionAnchor(opts: { year: number; id: string }): string {
  return `correction-${opts.year}-${opts.id}`;
}

/** Link to a correction's entry on the About page's corrections list. */
export function correctionHref(opts: { year: number; id: string }): string {
  return `${ABOUT_PATH}#${correctionAnchor(opts)}`;
}

/** Headings that were relabelled, as parallel lists: what the PDF prints and what we show. */
export function changedHeaders(correction: SourceCorrection): { printed: string[]; shown: string[] } {
  const printed: string[] = [];
  const shown: string[] = [];
  correction.originalHeaders.forEach((header, index) => {
    const corrected = correction.correctedHeaders[index];
    if (corrected !== header) {
      printed.push(header);
      shown.push(corrected);
    }
  });
  return { printed, shown };
}

/** `“2025 Budget” and “2026 Budget”` */
export function quoteList(headers: string[]): string {
  const quoted = headers.map((h) => `“${h}”`);
  return quoted.length <= 2 ? quoted.join(' and ') : `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`;
}

/** Corrections for one section of a year. */
export function correctionsForSection(opts: {
  corrections: SourceCorrection[];
  sectionSlug: string;
}): SourceCorrection[] {
  return opts.corrections.filter((c) => c.sectionSlug === opts.sectionSlug);
}

/** Corrections that touch a trust fund's figures in the given budget column (e.g. "2027 Budget"). */
export function trustFundCorrections(opts: {
  corrections: SourceCorrection[];
  departmentBudgets: DeptBudgetRow[];
  budgetColumn: string;
}): SourceCorrection[] {
  const { corrections, departmentBudgets, budgetColumn } = opts;
  const trustSlugs = new Set(
    departmentBudgets.filter((r) => r.fund === TRUST_FUND && r.year === budgetColumn).map((r) => r.slug),
  );
  return corrections.filter((c) => trustSlugs.has(c.sectionSlug));
}
