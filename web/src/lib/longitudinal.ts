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

export interface LongitudinalData {
  sources: LongitudinalSource[];
  records: LongitudinalRecord[];
  actuals: LongitudinalActual[];
}

/** One plotted point. */
export interface TrendPoint {
  fiscalYear: number;
  value: number;
  kind: Kind;
  /** Display name of the source document, e.g. "2027 Proposed". */
  sourceLabel: string;
}

/** One source document's own estimate/budget/forecast line. */
export interface Vintage {
  key: string;
  label: string;
  isHeadline: boolean;
  points: TrendPoint[];
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
  }));

  return { actuals, vintages: vintages.filter((v) => v.points.length > 0) };
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
  headlineLabel: string;
}): Callout[] {
  const { data, headlineSourceYear, headlineFiscalYear, headlineLabel } = opts;
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
        `${headlineLabel} recurring revenue is ${formatMillions(revenue.value)}, ` +
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
          `${formatMillions(useOfReserves.value)} of the ${headlineLabel} budget ` +
          `(${formatPercent({ value: share })} of its ${formatMillions(expenditures.value)} in spending) ` +
          `is funded from reserves rather than recurring revenue.`,
      });
    } else if (useOfReserves.value > 0) {
      callouts.push({
        id: 'reserve-funding',
        text: `${formatMillions(useOfReserves.value)} of the ${headlineLabel} budget is funded from reserves.`,
      });
    } else {
      callouts.push({
        id: 'reserve-funding',
        text: `The ${headlineLabel} budget uses no reserves; it is funded from recurring revenue.`,
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
    const tail = firstNegative
      ? `, and the balance first turns negative in ${firstNegative.fiscalYear}`
      : ', and the balance stays positive throughout';
    callouts.push({
      id: 'reserve-trajectory',
      text:
        `The ${headlineLabel} forecast projects the reserve fund ending ${last.fiscalYear} ` +
        `at ${formatMillions(last.value)}${tail}. Forecasts are not commitments.`,
    });
  }

  return callouts;
}

/** Notes explaining the provenance quirks of the data, derived from the data itself. */
export function buildNotes(opts: { data: LongitudinalData; labelSource: SourceLabeler }): string[] {
  const { data, labelSource } = opts;
  const notes: string[] = [];
  const headlineLevel = (a: LongitudinalActual): boolean => a.category === null;

  // Restatements.
  const restated = data.actuals.filter((a) => a.restatements.length > 0);
  if (restated.length > 0) {
    for (const a of restated) {
      const earlier = a.restatements
        .map((r) => `${formatMillions(r.value)} in the ${r.sourceYear} document`)
        .join(', ');
      notes.push(
        `${METRIC_LABEL[a.metric]}${a.category ? ` (${a.category})` : ''} for ${a.fiscalYear} was restated: ` +
          `${formatMillions(a.value)} in ${labelSource(a)}, previously ${earlier}.`,
      );
    }
  } else {
    notes.push(
      'No actual figure has been restated between the documents shown here. When documents disagree, ' +
        'the newest document is used and the earlier value is listed in this block.',
    );
  }

  // Expenditure actuals come from forecast department tables.
  const expenditureActuals = data.actuals
    .filter((a) => a.metric === METRIC.TOTAL_EXPENDITURES && headlineLevel(a))
    .sort(byFiscalYear);
  if (expenditureActuals.length > 0) {
    const perYear = expenditureActuals
      .map((a) => `${a.fiscalYear} (${labelSource(a)})`)
      .join(', ');
    notes.push(
      `Expenditure actuals are read from the department table on each document's Five-Year Financial ` +
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

  notes.push(
    'Each vintage line is that document’s own estimate, budget and forecast. Actuals come from the newest ' +
      'document that reports them. Forecasts are projections, not commitments.',
  );
  return notes;
}
