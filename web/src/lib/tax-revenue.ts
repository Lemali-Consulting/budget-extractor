/**
 * Each tax's budgeted revenue for one year, read from the revenue summary's
 * table of tax revenue by tax.
 *
 * Rich (Public Source) asked for a chart breaking tax revenue down by levy;
 * Max placed it on the revenue summary page (2026-11-12).
 */
import { parseCurrency } from './currency';
import { phraseCase, sentenceCase } from './text-case';

/**
 * The revenue summary's per-tax table is headed "Annual Growth Rate Tax
 * Revenue": the PDF prints a growth-rate band above the tax names, and the
 * extractor merges the two into one header.
 */
const TAX_TABLE_HEADER_SUFFIX = 'Tax Revenue';

/** The table's last row is the category total, named by its account code ("41 - Tax Revenue"). */
const CATEGORY_TOTAL_ROW = /^\d+\s*-\s/;

interface SectionTable {
  headers: string[];
  rows: string[][];
  absolute_page?: number;
}

export interface TaxRevenue {
  label: string;
  amount: number;
}

export interface TaxRevenueBreakdown {
  /** Taxes with revenue budgeted, largest first. */
  taxes: TaxRevenue[];
  /** Taxes the table lists with nothing budgeted, cased for use mid-sentence. */
  unbudgeted: string[];
  /** Page of the budget document the figures come from. */
  page: number | undefined;
}

function isTaxTable(table: SectionTable): boolean {
  return (table.headers[0] ?? '').trim().endsWith(TAX_TABLE_HEADER_SUFFIX);
}

/** The column for the year; later headers also carry the prior year's growth rate ("2.2% 2028"). */
function yearColumn(table: SectionTable, year: number): number {
  return table.headers.findIndex((h, i) => i > 0 && new RegExp(`\\b${year}\\b`).test(h));
}

/** The section's tax revenue by tax for the year, or null when the section has no such table. */
export function taxRevenueByTax(opts: { tables: SectionTable[]; year: number }): TaxRevenueBreakdown | null {
  const table = opts.tables.find(isTaxTable);
  if (!table) return null;
  const column = yearColumn(table, opts.year);
  if (column < 0) return null;

  const taxes: TaxRevenue[] = [];
  const unbudgeted: string[] = [];
  for (const row of table.rows) {
    const name = row[0] ?? '';
    if (CATEGORY_TOTAL_ROW.test(name)) continue;
    const amount = parseCurrency(row[column] ?? '');
    if (amount === null || amount === 0) unbudgeted.push(phraseCase(name));
    else taxes.push({ label: sentenceCase(name), amount });
  }
  taxes.sort((a, b) => b.amount - a.amount);
  return { taxes, unbudgeted, page: table.absolute_page };
}
