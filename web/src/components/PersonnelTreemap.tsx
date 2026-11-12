/**Bar chart showing staffing (FTE or budget) per department.*/

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { useContainerWidth } from '../lib/hooks';
import { CHART_COLORS } from '../lib/chart-colors';

interface DeptData {
  department: string;
  slug: string;
  totalFteCurrent: number;
}

type SizeBy = 'fte' | 'budget';

/** Width kept clear right of the bars for their value labels. */
const VALUE_LABEL_MARGIN = 56;

interface Props {
  data: DeptData[];
  /** Published page per department slug (see publishedSectionHrefs); bars without one aren't clickable. */
  sectionHrefs: Record<string, string>;
  /**
   * Each department's total budget by slug (totalBudgetBySlug), the figure its
   * department page shows, not what its positions cost (Max, 2026-11-12).
   */
  totalBudgets: Record<string, number>;
}

export default function PersonnelTreemap({ data, sectionHrefs, totalBudgets }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const [sizeBy, setSizeBy] = useState<SizeBy>('fte');

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chartData = data
      .map((d) => {
        const budget = totalBudgets[d.slug] ?? null;
        return {
          department: d.department,
          slug: d.slug,
          value: sizeBy === 'fte' ? d.totalFteCurrent : budget ?? 0,
          fte: d.totalFteCurrent,
          budget,
        };
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const formatValue = (d: number) =>
      sizeBy === 'budget'
        ? `$${(d / 1_000_000).toFixed(1)}M`
        : `${d}`;

    const chart = Plot.plot({
      marginLeft: 220,
      // Room for the value label on the longest bar (e.g. "$160.0M").
      marginRight: VALUE_LABEL_MARGIN,
      width: containerWidth,
      height: Math.max(300, chartData.length * 28),
      x: {
        label: sizeBy === 'fte' ? 'FTE count' : 'Budget ($)',
        tickFormat: sizeBy === 'budget'
          ? (d: number) => `$${(d / 1_000_000).toFixed(0)}M`
          : undefined,
      },
      y: { label: null },
      marks: [
        Plot.barX(chartData, {
          x: 'value',
          y: 'department',
          fill: CHART_COLORS.primary,
          sort: { y: '-x' },
          tip: true,
          title: (d: typeof chartData[0]) =>
            `${d.department}\nFTE: ${Math.round(d.fte)}` +
            (d.budget === null ? '' : ` | Budget: $${(d.budget / 1_000_000).toFixed(1)}M`),
        }),
        Plot.text(chartData, {
          x: 'value',
          y: 'department',
          text: (d: typeof chartData[0]) => formatValue(d.value),
          dx: 4,
          textAnchor: 'start',
          fontSize: 10,
        }),
        Plot.ruleX([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);

    // Make bars clickable — navigate to section detail pages
    // Observable Plot wraps bar marks in <g aria-label="bar">
    const barRects = Array.from(
      chart.querySelectorAll('g[aria-label="bar"] rect'),
    );
    barRects.forEach((rect, i) => {
      const href = i < chartData.length ? sectionHrefs[chartData[i].slug] : undefined;
      if (href) {
        rect.setAttribute('data-slug', chartData[i].slug);
        rect.style.cursor = 'pointer';
        rect.addEventListener('click', () => {
          window.location.href = href;
        });
        rect.addEventListener('mouseenter', () => {
          rect.setAttribute('opacity', '0.7');
        });
        rect.addEventListener('mouseleave', () => {
          rect.removeAttribute('opacity');
        });
      }
    });

    return () => chart.remove();
  }, [data, sizeBy, containerWidth, sectionHrefs, totalBudgets]);

  if (data.length === 0) {
    return <div class="text-gray-400 italic py-4">No personnel data available.</div>;
  }

  return (
    <div class="mb-8" ref={containerRef}>
      <div class="flex items-center gap-3 mb-4">
        <h3 class="text-lg font-semibold">Staffing distribution</h3>
        <select
          class="border rounded px-2 py-1 text-sm"
          value={sizeBy}
          onChange={(e) => setSizeBy((e.target as HTMLSelectElement).value as SizeBy)}
        >
          <option value="fte">FTE count</option>
          <option value="budget">Budget</option>
        </select>
      </div>
      <p class="text-sm text-gray-500 mb-3">
        Top 20 departments by {sizeBy === 'fte' ? 'headcount' : 'total budget'}. Hover for details.
      </p>
      <div ref={chartRef} />
    </div>
  );
}
