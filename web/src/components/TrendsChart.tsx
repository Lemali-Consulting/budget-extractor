/**Observable Plot line chart of one metric over time: actuals plus each budget document's own line.*/

import { useEffect, useRef } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';
import {
  KIND,
  KIND_LABEL,
  formatMillions,
  splitVintage,
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
const CHART_HEIGHT = 320;
const COMPACT_WIDTH = 480;
const COMPACT_HEIGHT = 280;

function vintageColor(opts: { vintage: Vintage; olderIndex: number }): string {
  return opts.vintage.isHeadline
    ? HEADLINE_COLOR
    : OLDER_VINTAGE_COLORS[opts.olderIndex % OLDER_VINTAGE_COLORS.length];
}

function tipTitle(p: TrendPoint): string {
  return `${p.sourceLabel}\n${KIND_LABEL[p.kind]} ${p.fiscalYear}: ${formatMillions(p.value)}`;
}

function formatAxisMillions(value: number): string {
  const millions = value / 1_000_000;
  return `${millions < 0 ? '−' : ''}$${Math.abs(millions).toFixed(0)}M`;
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

function Legend({ styled, hasActuals }: { styled: StyledVintage[]; hasActuals: boolean }) {
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
            <span>Actual</span>
          </li>
        )}
        {[...styled].reverse().map(({ vintage, color }) => (
          <li class="flex items-center gap-1.5">
            {swatch(color, vintage.isHeadline ? HEADLINE_WIDTH : OLDER_WIDTH)}
            <span class={vintage.isHeadline ? 'font-semibold text-blue-700' : ''}>
              {vintage.label}
              {vintage.isHeadline ? ' (headline)' : ''}
            </span>
          </li>
        ))}
      </ul>
      <p class="mt-1 text-gray-500">
        Solid = actual, estimate or budget; dashed = forecast (a projection, not a commitment).
      </p>
    </div>
  );
}

export default function TrendsChart({ series, zeroLine = false, ariaLabel }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const styled = styleVintages(series.vintages);

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
      ];
    });

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
        ...vintageMarks,
        Plot.lineY(series.actuals, {
          x: 'fiscalYear',
          y: 'value',
          stroke: ACTUAL_COLOR,
          strokeWidth: ACTUAL_WIDTH,
        }),
        Plot.dot(series.actuals, { x: 'fiscalYear', y: 'value', fill: ACTUAL_COLOR, r: 3.5 }),
        Plot.tip(everyPoint, Plot.pointer({ x: 'fiscalYear', y: 'value', title: tipTitle })),
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
      <Legend styled={styled} hasActuals={series.actuals.length > 0} />
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
