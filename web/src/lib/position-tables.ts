/**
 * A department's position summary, as one table: the permanent positions,
 * then the roll-up of temporary allowance, vacancy allowance and net salaries.
 *
 * The PDF prints a list of temporary, part-time and seasonal jobs between the
 * permanent positions and the roll-up, and the extractor splits the three
 * across two or three tables (one of them misread on some pages). Public
 * Source's fact-check found that confusing (Rich's factcheck sheet "1126",
 * row 30 and the rows that point to it), so the list is cut and the roll-up
 * joins the permanent table (Max, 2026-11-14). The roll-up's net salaries are
 * what the homepage payroll total adds up, so it stays.
 */

const TOTAL_PERMANENT = /^Total Full[- ]Time Permanent Positions$/i;
const NET_SALARIES = /^Total Full[- ]Time Positions (?:and|&) Net Salaries$/i;
/** The PDF's heading over the temporary list, as a row group and as a heading on its own page. */
const TEMPORARY_HEADING = 'Temporary, Part-Time, and Seasonal Allowances';
/** The extractor's types for position tables; "unknown" where it misread the roll-up's page. */
const POSITION_TABLE_TYPES: ReadonlySet<string> = new Set(['personnel', 'unknown']);
const SECTION_TITLE_ROLE = 'section_title';
/**
 * Where a five-column misread row's cells go in the nine-column table: title,
 * 2026 FTE, 2026 budget, 2027 FTE, 2027 budget (it lost the rate and hours columns).
 */
const NARROW_ROW_COLUMNS = [0, 1, 4, 5, 8] as const;

type Row = string[];

interface Table {
  id: string;
  table_type: string;
  headers?: string[];
  rows: Row[];
  sections?: (string | null)[] | null;
}

interface Section {
  tables: Table[];
  page_content?: { text_blocks?: { role: string; text: string }[] }[];
}

/** A row with the table it came from, so the temporary list can be told from a second unit's positions. */
interface SourcedRow {
  row: Row;
  fromLaterTable: boolean;
}

const label = (row: Row): string => (row[0] ?? '').trim();

function hasRow(table: Table, pattern: RegExp): boolean {
  return table.rows.some((row) => pattern.test(label(row)));
}

/** A misread row spread back into the table's columns. */
function widened(opts: { row: Row; width: number }): Row {
  const { row, width } = opts;
  if (row.length !== NARROW_ROW_COLUMNS.length || width <= row.length) return row;
  const out: Row = new Array(width).fill('');
  NARROW_ROW_COLUMNS.forEach((column, i) => (out[column] = row[i]));
  return out;
}

/** The PDF's temporary list: a group under the temporary heading, a fragment from a later table, or nothing. */
function isTemporaryList(rows: SourcedRow[]): boolean {
  if (rows.length === 0) return true;
  const first = rows[0];
  const isHeadingRow = label(first.row) === TEMPORARY_HEADING && first.row.slice(1).every((cell) => !cell.trim());
  return isHeadingRow || rows.every((r) => r.fromLaterTable);
}

/** The tables from the permanent positions through the roll-up, or null if the section has no such run. */
function positionRun(tables: Table[]): { start: number; end: number } | null {
  const start = tables.findIndex((t) => t.table_type === 'personnel' && hasRow(t, TOTAL_PERMANENT));
  if (start < 0) return null;
  const end = tables.findIndex((t, i) => i >= start && hasRow(t, NET_SALARIES));
  if (end < 0 || !tables.slice(start, end + 1).every((t) => POSITION_TABLE_TYPES.has(t.table_type))) return null;
  return { start, end };
}

/** The permanent table with the roll-up appended, or null if what lies between them isn't a temporary list. */
function mergedTable(run: Table[]): Table | null {
  const [main, ...later] = run;
  const width = main.headers?.length ?? main.rows[0]?.length ?? 0;
  const permanentEnd = main.rows.findIndex((row) => TOTAL_PERMANENT.test(label(row)));
  const rest: SourcedRow[] = [
    ...main.rows.slice(permanentEnd + 1).map((row) => ({ row, fromLaterTable: false })),
    ...later.flatMap((t) => t.rows.map((row) => ({ row: widened({ row, width }), fromLaterTable: true }))),
  ];
  const rollUpStart = rest.findIndex((r) => TOTAL_PERMANENT.test(label(r.row)));
  if (rollUpStart < 0 || !isTemporaryList(rest.slice(0, rollUpStart))) return null;

  const kept = main.rows.slice(0, permanentEnd + 1);
  const rollUp = rest.slice(rollUpStart + 1).map((r) => r.row);
  return {
    ...main,
    rows: [...kept, ...rollUp],
    ...(main.sections ? { sections: [...main.sections.slice(0, kept.length), ...rollUp.map(() => '')] } : {}),
  };
}

/** The section with its position tables merged and the temporary list cut; unchanged if it has no roll-up. */
export function withMergedPositionTables<S extends Section>(section: S): S {
  const run = positionRun(section.tables);
  if (!run) return section;
  const merged = mergedTable(section.tables.slice(run.start, run.end + 1));
  if (!merged) return section;
  return {
    ...section,
    tables: [...section.tables.slice(0, run.start), merged, ...section.tables.slice(run.end + 1)],
    page_content: section.page_content?.map((page) => ({
      ...page,
      text_blocks: page.text_blocks?.filter((b) => !(b.role === SECTION_TITLE_ROLE && b.text.trim() === TEMPORARY_HEADING)),
    })),
  };
}
