/**
 * Display labels for the rows a section chart plots, in house style.
 *
 * Category rows ("Charges for Services") are sentence-cased. A table whose rows
 * are department or fund names keeps them as printed: they are proper nouns,
 * and the PDF often prints them short ("Parks and Recreation",
 * "Public Safety Administration"), so no casing rule can tell them apart.
 * Max asked for the chart legend's casing to be fixed (2026-11-12).
 */
import { columnHeaderLabel } from './text-case';

/** An account row opens with its code ("51101 - Regular"); the name after it starts the label. */
const ACCOUNT_CODE_PREFIX = /^(\d+\s*-\s*)([a-z])/;

/** House-style label for a category row, capitalizing the name after any account code. */
function categoryLabel(label: string): string {
  return columnHeaderLabel(label).replace(ACCOUNT_CODE_PREFIX, (_, code: string, first: string) => code + first.toUpperCase());
}

/** A table counts as a list of names when at least this share of its rows match one. */
const NAME_LIST_MIN_SHARE = 0.5;

function rowName(row: string[]): string {
  return (row[0] ?? '').trim();
}

/** A row names a department or fund when one's title ends with it, or it ends with one's title. */
function matchesName(label: string, names: readonly string[]): boolean {
  const lower = label.toLowerCase();
  return names.some((name) => {
    const n = name.toLowerCase();
    return n.endsWith(lower) || lower.endsWith(n);
  });
}

export function chartRowLabels(opts: { rows: string[][]; properNames: readonly string[] }): string[] {
  const labels = opts.rows.map(rowName);
  const named = labels.filter((l) => l !== '');
  const matched = named.filter((l) => matchesName(l, opts.properNames)).length;
  const isNameList = named.length > 0 && matched / named.length >= NAME_LIST_MIN_SHARE;
  return labels.map((l) => (isNameList || matchesName(l, opts.properNames) ? l : categoryLabel(l)));
}
