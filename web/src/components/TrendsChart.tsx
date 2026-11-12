/**Observable Plot line chart of one metric over time: actuals plus each budget document's own line.*/

import { useEffect, useRef } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';
import {
  KIND,
  actualToHeadlineBridge,
  KIND_LABEL,
  formatMillions,
  splitVintage,
  type AlternatePoint,
  type TrendPoint,
  type TrendSeries,
  type Vintage,
} from '../lib/longitudinal';

interface Props {
  series: TrendSeries;
  /** Draw a heavy zero line (for metrics that can go negative). */
  zeroLine?: boolean;
  /** Short description for screen readers. */
  ariaLabel: string;
}

const ACTUAL_COLOR = '#111827'; // gray-900
const HEADLINE_COLOR = CHART_COLORS.primary;
/** Muted colors for older documents' lines, cycled in document order. */
const OLDER_VINTAGE_COLORS: readonly string[] = ['#94a3b8', '#d6a77a', '#8fbf9f', '#c4a7d6'];
const FORECAST_DASH = '6,4';
const HEADLINE_WIDTH = 3;
const OLDER_WIDTH = 1.75;
const ACTUAL_WIDTH = 2.5;
const ALTERNATE_RADIUS = 5;
const ALTERNATE_STROKE_WIDTH = 2;
const CHART_HEIGHT = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** Each chart's join needs its own gradient id; several charts share a page. */
let bridgeCount = 0;
const COMPACT_WIDTH = 480;
const COMPACT_HEIGHT = 280;

function vintageColor(opts: { vintage: Vintage; olderIndex: number }): string {
  return opts.vintage.isHeadline
    ? HEADLINE_COLOR
    : OLDER_VINTAGE_COLORS[opts.olderIndex % OLDER_VINTAGE_COLORS.length];
}

/** Source labels are written for mid-sentence use ("proposed 2027 budget"); a label or tooltip line starts with a capital. */
function asLabel(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function tipTitle(p: TrendPoint): string {
  return `${asLabel(p.sourceLabel)}\n${KIND_LABEL[p.kind]} ${p.fiscalYear}: ${formatMillions(p.value)}`;
}

function alternateTipTitle(p: AlternatePoint): string {
  return (
    `${asLabel(p.sourceLabel)}\n${KIND_LABEL[p.kind]} ${p.fiscalYear}: ${formatMillions(p.value)}\n` +
    `From the ${p.tableLabel}. The line shows ${formatMillions(p.lineValue)} from the summary table.`
  );
}

function formatAxisMillions(value: number): string {
  const millions = value / 1_000_000;
  return `${millions < 0 ? '−' : ''}$${Math.abs(millions).toFixed(0)}M`;
}

/**
 * A segment from the last actual to the headline line's first point, its
 * color passing from the actuals' to the headline's. Drawn in pixels, with a
 * gradient along its own length, so a flat segment still renders.
 */
function bridgeMark(opts: { from: TrendPoint; to: TrendPoint; gradientId: string }): Plot.RenderFunction {
  const { from, to, gradientId } = opts;
  return (_index, scales) => {
    if (!scales.x || !scales.y) return null;
    const [x1, y1, x2, y2] = [scales.x(from.fiscalYear), scales.y(from.value), scales.x(to.fiscalYear), scales.y(to.value)];
    const group = document.createElementNS(SVG_NS, 'g');
    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    for (const [attr, value] of [['x1', x1], ['y1', y1], ['x2', x2], ['y2', y2]] as const) {
      gradient.setAttribute(attr, String(value));
    }
    for (const [offset, color] of [['0', ACTUAL_COLOR], ['1', HEADLINE_COLOR]]) {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      gradient.appendChild(stop);
    }
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.appendChild(gradient);
    const line = document.createElementNS(SVG_NS, 'line');
    for (const [attr, value] of [['x1', x1], ['y1', y1], ['x2', x2], ['y2', y2]] as const) {
      line.setAttribute(attr, String(value));
    }
    line.setAttribute('stroke', `url(#${gradientId})`);
    line.setAttribute('stroke-width', String(HEADLINE_WIDTH));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('data-testid', 'trend-bridge');
    group.append(defs, line);
    return group;
  };
}

interface StyledVintage {
  vintage: Vintage;
  color: string;
}

function styleVintages(vintages: Vintage[]): StyledVintage[] {
  let older = 0;
  const styled = vintages.map((vintage) => ({
    vintage,
    color: vintageColor({ vintage, olderIndex: vintage.isHeadline ? 0 : older++ }),
  }));
  // Draw the headline last so it sits on top of older lines.
  return [...styled.filter((s) => !s.vintage.isHeadline), ...styled.filter((s) => s.vintage.isHeadline)];
}

function Legend({
  styled,
  hasActuals,
  hasAlternates,
}: {
  styled: StyledVintage[];
  hasActuals: boolean;
  hasAlternates: boolean;
}) {
  const swatch = (color: string, width: number) => (
    <svg width="28" height="10" aria-hidden="true" class="shrink-0">
      <line x1="0" y1="5" x2="28" y2="5" stroke={color} stroke-width={width} />
    </svg>
  );
  return (
    <div class="mb-2 text-xs text-gray-600">
      <ul class="flex flex-wrap gap-x-4 gap-y-1">
        {hasActuals && (
          <li class="flex items-center gap-1.5">
            {swatch(ACTUAL_COLOR, ACTUAL_WIDTH)}
            <span data-testid="trend-legend-item">Actual</span>
          </li>
        )}
        {[...styled].reverse().map(({ vintage, color }) => (
          <li class="flex items-center gap-1.5">
            {swatch(color, vintage.isHeadline ? HEADLINE_WIDTH : OLDER_WIDTH)}
            <span class={vintage.isHeadline ? 'font-semibold text-ps-blue-700' : ''} data-testid="trend-legend-item">
              {asLabel(vintage.label)}
            </span>
          </li>
        ))}
      </ul>
      <p class="mt-1 text-gray-500">
        Solid = {hasActuals ? 'actual, estimate or budget' : 'estimate or budget'}; dashed = forecast (a projection, not a commitment).
        {hasAlternates && ' Hollow diamond = a different figure for the same year from another table in the same document (see Notes).'}
      </p>
    </div>
  );
}

export default function TrendsChart({ series, zeroLine = false, ariaLabel }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const styled = styleVintages(series.vintages);
  const alternatePoints: AlternatePoint[] = series.vintages.flatMap((v) => v.alternates);
  const gradientIdRef = useRef<string>('');
  if (!gradientIdRef.current) gradientIdRef.current = `trend-bridge-${++bridgeCount}`;

  useEffect(() => {
    if (!chartRef.current) return;
    const compact = containerWidth < COMPACT_WIDTH;

    const everyPoint: TrendPoint[] = [...series.actuals, ...series.vintages.flatMap((v) => v.points)];
    const years = [...new Set(everyPoint.map((p) => p.fiscalYear))].sort((a, b) => a - b);

    const vintageMarks = styled.flatMap(({ vintage, color }) => {
      const { solid, dashed } = splitVintage(vintage.points);
      const strokeWidth = vintage.isHeadline ? HEADLINE_WIDTH : OLDER_WIDTH;
      return [
        Plot.lineY(solid, { x: 'fiscalYear', y: 'value', stroke: color, strokeWidth }),
        Plot.lineY(dashed, {
          x: 'fiscalYear',
          y: 'value',
          stroke: color,
          strokeWidth,
          strokeDasharray: FORECAST_DASH,
        }),
        Plot.dot(solid, { x: 'fiscalYear', y: 'value', fill: color, r: vintage.isHeadline ? 3.5 : 2.5 }),
        Plot.dot(dashed.filter((p) => p.kind === KIND.FORECAST), {
          x: 'fiscalYear',
          y: 'value',
          stroke: color,
          fill: 'white',
          r: 2.5,
        }),
        Plot.dot(vintage.alternates, {
          x: 'fiscalYear',
          y: 'value',
          symbol: 'diamond',
          stroke: color,
          strokeWidth: ALTERNATE_STROKE_WIDTH,
          fill: 'white',
          r: ALTERNATE_RADIUS,
        }),
      ];
    });

    const bridge = actualToHeadlineBridge(series);
    const bridgeMarks = bridge
      ? [bridgeMark({ from: bridge[0], to: bridge[1], gradientId: gradientIdRef.current })]
      : [];

    const chart = Plot.plot({
      width: containerWidth,
      height: compact ? COMPACT_HEIGHT : CHART_HEIGHT,
      marginLeft: compact ? 52 : 64,
      marginRight: 16,
      x: {
        label: null,
        tickFormat: (d: number) => String(d),
        ticks: compact ? years.filter((_, i) => i % 2 === 0) : years,
      },
      y: { label: null, grid: true, tickFormat: formatAxisMillions },
      marks: [
        ...(zeroLine ? [Plot.ruleY([0], { stroke: '#374151', strokeWidth: 1.5 })] : []),
        ...bridgeMarks,
        ...vintageMarks,
        Plot.lineY(series.actuals, {
          x: 'fiscalYear',
          y: 'value',
          stroke: ACTUAL_COLOR,
          strokeWidth: ACTUAL_WIDTH,
        }),
        Plot.dot(series.actuals, { x: 'fiscalYear', y: 'value', fill: ACTUAL_COLOR, r: 3.5 }),
        Plot.tip(everyPoint, Plot.pointer({ x: 'fiscalYear', y: 'value', title: tipTitle })),
        ...(alternatePoints.length > 0
          ? [Plot.tip(alternatePoints, Plot.pointer({ x: 'fiscalYear', y: 'value', title: alternateTipTitle }))]
          : []),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [series, zeroLine, containerWidth]);

  if (everyPointCount(series) === 0) {
    return <div class="text-gray-400 italic py-4">No data available.</div>;
  }

  return (
    <div ref={containerRef} role="group" aria-label={ariaLabel}>
      <Legend styled={styled} hasActuals={series.actuals.length > 0} hasAlternates={alternatePoints.length > 0} />
      <div ref={chartRef} />
      {!zeroLine && (
        <p class="mt-1 text-xs text-gray-400">The vertical axis does not start at zero.</p>
      )}
    </div>
  );
}

function everyPointCount(series: TrendSeries): number {
  return series.actuals.length + series.vintages.reduce((n, v) => n + v.points.length, 0);
}
