/**
 * Which rows of a financial table a section chart plots.
 *
 * A row with no label is left out: the extractor sometimes loses the label of
 * a department summary's total row, and the chart used to plot it as "Row",
 * as big as the whole budget. Where the PDF prints spending categories
 * ("51 - PERSONNEL-SALARIES & WAGES") above their line items ("51101 -
 * Regular"), only the categories are plotted, since charting both counts the
 * same dollars twice. Public Source's fact-check found both (Rich's factcheck
 * sheet "1126", rows 22, 32, 37, 39, 40 and 44).
 */

/** A two-digit spending category row, e.g. "51 - PERSONNEL-SALARIES & WAGES" (line items carry five digits). */
export const SPENDING_CATEGORY_LABEL = /^\d{2} - /;

function rowLabel(row: string[]): string {
  return (row[0] ?? '').trim();
}

export function chartedRows(rows: string[][]): string[][] {
  const labelled = rows.filter((row) => rowLabel(row) !== '');
  const categories = labelled.filter((row) => SPENDING_CATEGORY_LABEL.test(rowLabel(row)));
  return categories.length > 0 ? categories : labelled;
}
