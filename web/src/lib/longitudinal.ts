/**
 * Data shaping for the /trends/ page: typed access to the longitudinal dataset,
 * per-metric series (actuals plus one "vintage" line per source document), and
 * the prose callouts and notes computed from them. Pure functions; no imports
 * of server-only modules, so Preact components can use the types and helpers.
 */

export const METRIC = {
  TOTAL_REVENUES: 'totalRevenues',
  RECURRING_REVENUE: 'recurringRevenue',
  USE_OF_FUND_BALANCE: 'useOfFundBalance',
  TOTAL_EXPENDITURES: 'totalExpenditures',
  OPERATING_RESULT: 'operatingResult',
  ENDING_RESERVE_BALANCE: 'endingReserveBalance',
  FUND_BALANCE_PCT: 'fundBalancePctOfExpenditures',
  REVENUE_BY_CATEGORY: 'revenueByCategory',
  EXPENDITURE_BY_CATEGORY: 'expenditureByCategory',
} as const;
export type Metric = (typeof METRIC)[keyof typeof METRIC];

export const KIND = {
  ACTUAL: 'actual',
  ESTIMATE: 'estimate',
  BUDGET: 'budget',
  FORECAST: 'forecast',
} as const;
export type Kind = (typeof KIND)[keyof typeof KIND];

/** Which table of a budget document a figure was read from (matches the build script's table kinds). */
export const TABLE_KIND = {
  SUMMARY: 'summary',
  DEPARTMENT: 'department',
} as const;
export type TableKind = (typeof TABLE_KIND)[keyof typeof TABLE_KIND];

/** Human wording for each table, used in tooltips and notes. */
export const TABLE_LABEL: Record<TableKind, string> = {
  [TABLE_KIND.SUMMARY]: 'five-year financial forecast summary table',
  [TABLE_KIND.DEPARTMENT]: 'department table (forecast detail) of the same section',
};

/** Human wording for each kind, used in tooltips and notes. */
export const KIND_LABEL: Record<Kind, string> = {
  [KIND.ACTUAL]: 'Actual',
  [KIND.ESTIMATE]: 'Estimate',
  [KIND.BUDGET]: 'Budget',
  [KIND.FORECAST]: 'Forecast',
};

/** Human wording for each metric, used in notes. */
export const METRIC_LABEL: Record<Metric, string> = {
  [METRIC.TOTAL_REVENUES]: 'Total revenues',
  [METRIC.RECURRING_REVENUE]: 'Recurring revenue',
  [METRIC.USE_OF_FUND_BALANCE]: 'Use of fund balance',
  [METRIC.TOTAL_EXPENDITURES]: 'Total expenditures',
  [METRIC.OPERATING_RESULT]: 'Operating result',
  [METRIC.ENDING_RESERVE_BALANCE]: 'Ending reserve balance',
  [METRIC.FUND_BALANCE_PCT]: 'Fund balance as % of expenditures',
  [METRIC.REVENUE_BY_CATEGORY]: 'Revenue by category',
  [METRIC.EXPENDITURE_BY_CATEGORY]: 'Expenditure by category',
};

/** How many revenue categories the by-category view offers (largest in the headline budget). */
export const MAJOR_CATEGORY_COUNT = 6;

const MINUS_SIGN = '−';
const MILLION = 1_000_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LongitudinalSource {
  sourceYear: number;
  sourceVariant: string;
}

export interface LongitudinalRecord extends LongitudinalSource {
  metric: Metric;
  category: string | null;
  fiscalYear: number;
  value: number;
  kind: Kind;
  sourceSection: string;
  sourceTable: string;
  derived?: boolean;
}

export interface LongitudinalActual extends LongitudinalRecord {
  restatements: { sourceYear: number; value: number }[];
}

/** One table's figure in a conflict. */
export interface ConflictValue {
  value: number;
  sourceSection: string;
  sourceTable: string;
  table: TableKind;
}

/** One document's tables disagreeing about the same figure; the series line uses the summary table's value. */
export interface LongitudinalConflict extends LongitudinalSource {
  metric: Metric;
  fiscalYear: number;
  kind: Kind;
  values: ConflictValue[];
}

export interface LongitudinalData {
  sources: LongitudinalSource[];
  records: LongitudinalRecord[];
  actuals: LongitudinalActual[];
  conflicts: LongitudinalConflict[];
}

/** One plotted point. */
export interface TrendPoint {
  fiscalYear: number;
  value: number;
  kind: Kind;
  /** Display name of the source document, e.g. "2027 Proposed". */
  sourceLabel: string;
}

/** A figure the same document reports differently in another table, drawn as its own marker. */
export interface AlternatePoint extends TrendPoint {
  /** Wording for the table this figure comes from. */
  tableLabel: string;
  /** The figure the line shows for the same year. */
  lineValue: number;
}

/** One source document's own estimate/budget/forecast line. */
export interface Vintage {
  key: string;
  label: string;
  isHeadline: boolean;
  points: TrendPoint[];
  /** Conflicting figures from the document's other table; empty for most metrics. */
  alternates: AlternatePoint[];
}

export interface TrendSeries {
  actuals: TrendPoint[];
  /** Oldest document first. */
  vintages: Vintage[];
}

/** Maps a source document to its display label, supplied by the page. */
export type SourceLabeler = (source: LongitudinalSource) => string;

export interface Callout {
  id: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function sourceKey(source: LongitudinalSource): string {
  return `${source.sourceYear}-${source.sourceVariant}`;
}

/** "$701.8M" / "−$38.2M" */
export function formatMillions(value: number): string {
  const sign = value < 0 ? MINUS_SIGN : '';
  return `${sign}$${(Math.abs(value) / MILLION).toFixed(1)}M`;
}

export function formatPercent(opts: { value: number; digits?: number; signed?: boolean }): string {
  const { value, digits = 1, signed = false } = opts;
  const sign = value < 0 ? MINUS_SIGN : signed && value > 0 ? '+' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

function byFiscalYear(a: { fiscalYear: number }, b: { fiscalYear: number }): number {
  return a.fiscalYear - b.fiscalYear;
}

function sourceOrder(a: LongitudinalSource, b: LongitudinalSource): number {
  return a.sourceYear - b.sourceYear;
}

/** Actuals plus one vintage line per source document for a metric (and category). */
export function buildSeries(opts: {
  data: LongitudinalData;
  metric: Metric;
  category?: string | null;
  labelSource: SourceLabeler;
  headlineSourceYear: number;
}): TrendSeries {
  const { data, metric, category = null, labelSource, headlineSourceYear } = opts;
  const matches = (r: LongitudinalRecord): boolean => r.metric === metric && r.category === category;

  const actuals: TrendPoint[] = data.actuals
    .filter(matches)
    .map((r) => ({
      fiscalYear: r.fiscalYear,
      value: r.value,
      kind: KIND.ACTUAL,
      sourceLabel: labelSource(r),
    }))
    .sort(byFiscalYear);

  const vintages: Vintage[] = [...data.sources].sort(sourceOrder).map((source) => ({
    key: sourceKey(source),
    label: labelSource(source),
    isHeadline: source.sourceYear === headlineSourceYear,
    points: data.records
      .filter(
        (r) => matches(r) && r.kind !== KIND.ACTUAL && sourceKey(r) === sourceKey(source),
      )
      .map((r) => ({
        fiscalYear: r.fiscalYear,
        value: r.value,
        kind: r.kind,
        sourceLabel: labelSource(source),
      }))
      .sort(byFiscalYear),
    alternates: alternatePoints({ data, metric, category, source, label: labelSource(source) }),
  }));

  return { actuals, vintages: vintages.filter((v) => v.points.length > 0) };
}

/** The non-line figures of a document's conflicting tables, for one metric (category-level metrics have none). */
function alternatePoints(opts: {
  data: LongitudinalData;
  metric: Metric;
  category: string | null;
  source: LongitudinalSource;
  label: string;
}): AlternatePoint[] {
  const { data, metric, category, source, label } = opts;
  if (category !== null) return [];
  return (data.conflicts ?? [])
    .filter((c) => c.metric === metric && sourceKey(c) === sourceKey(source))
    .flatMap((c) => {
      const line = c.values.find((v) => v.table === TABLE_KIND.SUMMARY);
      return c.values
        .filter((v) => v.table !== TABLE_KIND.SUMMARY && line !== undefined)
        .map((v) => ({
          fiscalYear: c.fiscalYear,
          value: v.value,
          kind: c.kind,
          sourceLabel: label,
          tableLabel: TABLE_LABEL[v.table],
          lineValue: (line as ConflictValue).value,
        }));
    })
    .sort(byFiscalYear);
}

/**
 * Split a vintage into the part drawn solid (estimate and budget years) and the
 * part drawn dashed (forecast years). The dashed part starts at the last solid
 * point so the line reads as continuous.
 */
export function splitVintage(points: TrendPoint[]): { solid: TrendPoint[]; dashed: TrendPoint[] } {
  const solid = points.filter((p) => p.kind !== KIND.FORECAST);
  const forecast = points.filter((p) => p.kind === KIND.FORECAST);
  const anchor = solid.length > 0 ? [solid[solid.length - 1]] : [];
  return { solid, dashed: forecast.length > 0 ? [...anchor, ...forecast] : [] };
}

/**
 * Keep only the headline document's line beside the actuals. Rich (Public
 * Source) found one forecast line per document confusing; Max chose one line
 * per chart (2026-11-12).
 */
export function headlineVintageOnly(series: TrendSeries): TrendSeries {
  return { ...series, vintages: series.vintages.filter((v) => v.isHeadline) };
}

/**
 * The last actual and the headline line's first point, when they fall in
 * adjacent years, so the chart can join them. Max asked for the two lines to
 * connect (2026-11-12); across a gap the join would draw a trend for years no
 * document reports, so none is returned.
 */
export function actualToHeadlineBridge(series: TrendSeries): [TrendPoint, TrendPoint] | null {
  const lastActual = series.actuals[series.actuals.length - 1];
  const firstHeadline = series.vintages.find((v) => v.isHeadline)?.points[0];
  if (!lastActual || !firstHeadline) return null;
  return firstHeadline.fiscalYear - lastActual.fiscalYear === 1 ? [lastActual, firstHeadline] : null;
}

/** Largest revenue categories in the headline document's budget year, biggest first. */
export function majorRevenueCategories(opts: {
  data: LongitudinalData;
  headlineSourceYear: number;
  headlineFiscalYear: number;
  count?: number;
}): string[] {
  const { data, headlineSourceYear, headlineFiscalYear, count = MAJOR_CATEGORY_COUNT } = opts;
  return data.records
    .filter(
      (r) =>
        r.metric === METRIC.REVENUE_BY_CATEGORY &&
        r.category !== null &&
        r.sourceYear === headlineSourceYear &&
        r.fiscalYear === headlineFiscalYear &&
        r.kind !== KIND.ACTUAL,
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((r) => r.category as string);
}

// ---------------------------------------------------------------------------
// Callouts and notes
// ---------------------------------------------------------------------------

function headlineRecord(opts: {
  data: LongitudinalData;
  metric: Metric;
  headlineSourceYear: number;
  fiscalYear: number;
}): LongitudinalRecord | undefined {
  const { data, metric, headlineSourceYear, fiscalYear } = opts;
  return data.records.find(
    (r) =>
      r.metric === metric &&
      r.category === null &&
      r.sourceYear === headlineSourceYear &&
      r.fiscalYear === fiscalYear &&
      r.kind !== KIND.ACTUAL,
  );
}

/** Callouts comparing the headline budget with history; each is omitted if its data is missing. */
export function buildCallouts(opts: {
  data: LongitudinalData;
  headlineSourceYear: number;
  headlineFiscalYear: number;
  /** The headline budget's name as used mid-sentence, e.g. "proposed 2027 budget". */
  budgetName: string;
}): Callout[] {
  const { data, headlineSourceYear, headlineFiscalYear, budgetName } = opts;
  const callouts: Callout[] = [];
  const headline = (metric: Metric): LongitudinalRecord | undefined =>
    headlineRecord({ data, metric, headlineSourceYear, fiscalYear: headlineFiscalYear });

  // Recurring revenue vs the latest actual year.
  const revenue = headline(METRIC.RECURRING_REVENUE);
  const revenueActuals = data.actuals
    .filter((a) => a.metric === METRIC.RECURRING_REVENUE && a.category === null)
    .sort(byFiscalYear);
  const latestActual = revenueActuals[revenueActuals.length - 1];
  if (revenue && latestActual) {
    const years = headlineFiscalYear - latestActual.fiscalYear;
    const change = (revenue.value / latestActual.value - 1) * 100;
    const direction = change >= 0 ? 'above' : 'below';
    const annualized =
      years > 0 ? (Math.pow(revenue.value / latestActual.value, 1 / years) - 1) * 100 : null;
    const annualText =
      annualized === null
        ? ''
        : `, an average of ${formatPercent({ value: annualized, signed: true })} a year over ${years} ${years === 1 ? 'year' : 'years'}`;
    callouts.push({
      id: 'revenue-vs-actual',
      text:
        `Recurring revenue in the ${budgetName} is ${formatMillions(revenue.value)}, ` +
        `${formatPercent({ value: Math.abs(change) })} ${direction} the latest reported actual ` +
        `(${latestActual.fiscalYear}: ${formatMillions(latestActual.value)})${annualText}.`,
    });
  }

  // Reliance on reserves.
  const useOfReserves = headline(METRIC.USE_OF_FUND_BALANCE);
  const expenditures = headline(METRIC.TOTAL_EXPENDITURES);
  if (useOfReserves) {
    if (useOfReserves.value > 0 && expenditures) {
      const share = (useOfReserves.value / expenditures.value) * 100;
      callouts.push({
        id: 'reserve-funding',
        text:
          `${formatMillions(useOfReserves.value)} of the ${budgetName} ` +
          `(${formatPercent({ value: share })} of its ${formatMillions(expenditures.value)} in spending) ` +
          `is funded from reserves rather than recurring revenue.`,
      });
    } else if (useOfReserves.value > 0) {
      callouts.push({
        id: 'reserve-funding',
        text: `${formatMillions(useOfReserves.value)} of the ${budgetName} is funded from reserves.`,
      });
    } else {
      callouts.push({
        id: 'reserve-funding',
        text: `The ${budgetName} uses no reserves; it is funded from recurring revenue.`,
      });
    }
  }

  // Reserve trajectory over the forecast horizon.
  const reserveLine = data.records
    .filter(
      (r) =>
        r.metric === METRIC.ENDING_RESERVE_BALANCE &&
        r.category === null &&
        r.sourceYear === headlineSourceYear &&
        r.kind !== KIND.ACTUAL,
    )
    .sort(byFiscalYear);
  if (reserveLine.length > 0) {
    const last = reserveLine[reserveLine.length - 1];
    const firstNegative = reserveLine.find((r) => r.value < 0);
    callouts.push({
      id: 'reserve-trajectory',
      text: reserveTrajectoryText({ forecastYear: headlineFiscalYear, last, firstNegative }),
    });
  }

  return callouts;
}

/**
 * Rich's wording for the reserve callout (2026-11-12): "The 2027 forecast
 * projects the reserve fund turning negative in 2031 and finishing the year
 * at −$31.4M."
 */
function reserveTrajectoryText(opts: {
  forecastYear: number;
  last: LongitudinalRecord;
  firstNegative: LongitudinalRecord | undefined;
}): string {
  const { forecastYear, last, firstNegative } = opts;
  const ending = formatMillions(last.value);
  if (!firstNegative) {
    return `The ${forecastYear} forecast projects the reserve fund staying positive and finishing ${last.fiscalYear} at ${ending}.`;
  }
  const finish =
    firstNegative.fiscalYear === last.fiscalYear ? 'finishing the year' : `finishing ${last.fiscalYear}`;
  return `The ${forecastYear} forecast projects the reserve fund turning negative in ${firstNegative.fiscalYear} and ${finish} at ${ending}.`;
}

/**
 * Notes explaining the provenance quirks of what the charts show, derived from
 * the data itself. The charts draw only the headline document's line, so notes
 * about other documents' lines (their restated actuals, their internal
 * conflicts) are left out.
 */
export function buildNotes(opts: {
  data: LongitudinalData;
  labelSource: SourceLabeler;
  headlineSourceYear: number;
  /** The headline budget's name as used mid-sentence, e.g. "proposed 2027 budget". */
  budgetName: string;
}): string[] {
  const { data, labelSource, headlineSourceYear, budgetName } = opts;
  const notes: string[] = [];
  const headlineLevel = (a: LongitudinalActual): boolean => a.category === null;

  // Expenditure actuals come from forecast department tables.
  const expenditureActuals = data.actuals
    .filter((a) => a.metric === METRIC.TOTAL_EXPENDITURES && headlineLevel(a))
    .sort(byFiscalYear);
  if (expenditureActuals.length > 0) {
    const perYear = expenditureActuals
      .map((a) => `${a.fiscalYear} (${labelSource(a)})`)
      .join(', ');
    notes.push(
      `Expenditure actuals are read from the department table on each document's five-year financial ` +
        `Forecast page, not from a dedicated history table: ${perYear}.`,
    );
  }

  // Years with spending actuals but no revenue actuals.
  const revenueActualYears = new Set(
    data.actuals
      .filter(
        (a) =>
          headlineLevel(a) &&
          (a.metric === METRIC.RECURRING_REVENUE || a.metric === METRIC.TOTAL_REVENUES),
      )
      .map((a) => a.fiscalYear),
  );
  const missingRevenue = expenditureActuals
    .map((a) => a.fiscalYear)
    .filter((year) => !revenueActualYears.has(year));
  if (missingRevenue.length > 0) {
    const years = missingRevenue.join(' and ');
    notes.push(
      `Actual revenue for ${years} is not yet published in any budget document loaded here, ` +
        `so the revenue chart has no actual point for ${missingRevenue.length === 1 ? 'that year' : 'those years'}.`,
    );
  }

  notes.push(...buildConflictNotes({ data, labelSource, headlineSourceYear }));

  notes.push(
    `The blue line is the ${budgetName}’s own estimate, budget and forecast. Actuals come from the newest ` +
      'document that reports them. Forecasts are projections, not commitments.',
  );
  return notes;
}

/** One neutral note per conflict: the document disagrees with itself, and we say which figure the line uses. */
function buildConflictNotes(opts: {
  data: LongitudinalData;
  labelSource: SourceLabeler;
  headlineSourceYear: number;
}): string[] {
  const { data, labelSource, headlineSourceYear } = opts;
  return (data.conflicts ?? []).filter((c) => c.sourceYear === headlineSourceYear).flatMap((conflict) => {
    const summary = conflict.values.find((v) => v.table === TABLE_KIND.SUMMARY);
    const other = conflict.values.find((v) => v.table !== TABLE_KIND.SUMMARY);
    if (!summary || !other) return [];
    return [
      `The ${labelSource(conflict)} document gives two different ${conflict.fiscalYear} ` +
        `${KIND_LABEL[conflict.kind].toLowerCase()} figures for ${METRIC_LABEL[conflict.metric].toLowerCase()}: ` +
        `${formatMillions(summary.value)} in its ${TABLE_LABEL[summary.table]} and ` +
        `${formatMillions(other.value)} in its ${TABLE_LABEL[other.table]}. ` +
        `The line uses the ${TABLE_LABEL[summary.table]}'s figure; the other is marked with a hollow diamond.`,
    ];
  });
}
