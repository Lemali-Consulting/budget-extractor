/**
 * Which cells of a reproduced table to shade as an increase or a decrease
 * from the year before.
 *
 * A year column is compared with the previous year's column of the same kind
 * ("2027 FTE" with "2026 FTE", "2030" with "2029"). A forecast also follows
 * on from the budget year before it, but a budget is never shaded against an
 * actual or an estimate: they measure different things. A percentage cell is
 * already a change, so it is shaded by its sign. Public Source's fact-check
 * (Rich's factcheck sheet "1126", rows 17, 18 and 21-46) found the old rule,
 * which compared each year with the first one in the table, shading rises red.
 */

export const INCREASE = 'changed-increase';
export const DECREASE = 'changed-decrease';
export const UNCHANGED = '';
export type ChangeClass = typeof INCREASE | typeof DECREASE | typeof UNCHANGED;

const YEAR = /\b(20\d{2})\b/;
const PERCENT = /%$/;
const BUDGET_KIND = 'budget';
const FORECAST_KIND = 'forecast';

interface YearColumn {
  index: number;
  year: number;
  /** The header without its year, lowercased: "budget", "fte", "" for a bare year. */
  kind: string;
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (!t || t === '—' || t === '-') return null;
  const neg = t.startsWith('(') || t.startsWith('-');
  const num = parseFloat(t.replace(/[$,()]/g, ''));
  if (isNaN(num)) return null;
  return neg ? -Math.abs(num) : num;
}

function yearColumns(headers: string[]): YearColumn[] {
  return headers.flatMap((header, index) => {
    const m = (header || '').match(YEAR);
    if (!m) return [];
    return [{ index, year: parseInt(m[1], 10), kind: header.replace(YEAR, '').trim().toLowerCase() }];
  });
}

function followsOn(opts: { prior: YearColumn; later: YearColumn }): boolean {
  const { prior, later } = opts;
  if (later.year !== prior.year + 1) return false;
  return prior.kind === later.kind || (prior.kind === BUDGET_KIND && later.kind === FORECAST_KIND);
}

/** Maps each year column's index to the index of the column it is compared with. */
function priorColumns(headers: string[]): Map<number, number> {
  const columns = yearColumns(headers);
  const pairs = new Map<number, number>();
  for (const later of columns) {
    const prior = columns.filter((c) => c.index < later.index && followsOn({ prior: c, later })).at(-1);
    if (prior) pairs.set(later.index, prior.index);
  }
  return pairs;
}

function shadeBySign(value: number | null): ChangeClass {
  if (value === null || value === 0) return UNCHANGED;
  return value > 0 ? INCREASE : DECREASE;
}

function shadeCell(opts: { cell: string; prior: string }): ChangeClass {
  const current = parseNum(opts.cell);
  if (PERCENT.test(opts.cell.trim())) return shadeBySign(current);
  const previous = parseNum(opts.prior);
  if (current === null || previous === null) return UNCHANGED;
  return shadeBySign(current - previous);
}

export function changeShading(table: { headers: string[]; rows: string[][] }): ChangeClass[][] {
  const pairs = priorColumns(table.headers);
  return table.rows.map((row) =>
    row.map((cell, ci) => {
      const priorCol = pairs.get(ci);
      if (priorCol === undefined) return UNCHANGED;
      return shadeCell({ cell: cell || '', prior: row[priorCol] || '' });
    }),
  );
}
