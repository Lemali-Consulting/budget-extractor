/**
 * Puts back a growth-rate row that the extractor merged into the next
 * table's column headings.
 *
 * The revenue summary prints revenue by subclass, ending with an "Annual
 * Growth Rate" row (2.2%, 0.9%, ...), and just below it a "Tax Revenue"
 * table. The extractor read the rates and that title as the second table's
 * headings: "Annual Growth Rate Tax Revenue", "2027", "2.2% 2028", ... Public
 * Source's fact-check found the result unreadable (Rich's factcheck sheet
 * "1126", row 18). The rates go back as the last row of the table above, and
 * the second table's headings become its title and plain years again. A
 * table whose neighbour above has different years is left as it is.
 */

const GROWTH_RATE_LABEL = 'Annual Growth Rate';
/** A heading the rate was glued onto: "2.2% 2028", "(0.4)% 2029". */
const RATE_BEFORE_YEAR = /^(\(?-?[\d.]+\)?%)\s+(20\d{2})$/;

interface Table {
  relative_page?: number;
  headers: string[];
  rows: string[][];
  /** Row-group label per row, where the table has groups. */
  sections?: (string | null)[] | null;
}

interface Split {
  headers: string[];
  growthRow: string[];
}

/** The headings and growth-rate row a merged table's headings stand for, or null when they aren't merged. */
function splitMergedHeaders(headers: string[]): Split | null {
  const [label, ...rest] = headers;
  if (!label?.startsWith(`${GROWTH_RATE_LABEL} `)) return null;
  if (!rest.some((h) => RATE_BEFORE_YEAR.test(h))) return null;
  const growthRow = [GROWTH_RATE_LABEL, ...rest.map((h) => h.match(RATE_BEFORE_YEAR)?.[1] ?? '')];
  const plainHeaders = [label.slice(GROWTH_RATE_LABEL.length).trim(), ...rest.map((h) => h.match(RATE_BEFORE_YEAR)?.[2] ?? h)];
  return { headers: plainHeaders, growthRow };
}

function sameColumns(opts: { above: Table; split: Split }): boolean {
  const { above, split } = opts;
  return above.headers.length === split.headers.length && above.headers.slice(1).every((h, i) => h === split.headers[i + 1]);
}

export function withGrowthRateRowRestored<T extends { tables: Table[] }>(section: T): T {
  const tables = [...section.tables];
  let changed = false;
  for (let i = 1; i < tables.length; i++) {
    const split = splitMergedHeaders(tables[i].headers);
    const above = tables[i - 1];
    if (!split || above.relative_page !== tables[i].relative_page || !sameColumns({ above, split })) continue;
    tables[i - 1] = {
      ...above,
      rows: [...above.rows, split.growthRow],
      ...(Array.isArray(above.sections) ? { sections: [...above.sections, ''] } : {}),
    };
    tables[i] = { ...tables[i], headers: split.headers };
    changed = true;
  }
  return changed ? { ...section, tables } : section;
}
