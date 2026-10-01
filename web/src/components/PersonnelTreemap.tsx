/**Bar chart showing staffing (FTE or budget) per department with change indicators.*/

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { useContainerWidth } from '../lib/hooks';

interface DeptData {
  department: string;
  slug: string;
  totalFtePrior: number;
  totalFteCurrent: number;
  totalBudgetPrior: number;
  totalBudgetCurrent: number;
  positionCount: number;
}

type SizeBy = 'fte' | 'budget';

interface Props {
  data: DeptData[];
  /** Route prefix of the budget year's pages ("" headline, "/2026" archive). */
  routePrefix: string;
}

export default function PersonnelTreemap({ data, routePrefix }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const [sizeBy, setSizeBy] = useState<SizeBy>('fte');

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chartData = data
      .map((d) => ({
        department: d.department,
        slug: d.slug,
        value: sizeBy === 'fte' ? d.totalFteCurrent : d.totalBudgetCurrent,
        change: sizeBy === 'fte'
          ? d.totalFteCurrent - d.totalFtePrior
          : d.totalBudgetCurrent - d.totalBudgetPrior,
        fte: d.totalFteCurrent,
        budget: d.totalBudgetCurrent,
        positions: d.positionCount,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);

    const formatValue = (d: number) =>
      sizeBy === 'budget'
        ? `$${(d / 1_000_000).toFixed(1)}M`
        : `${d}`;

    const chart = Plot.plot({
      marginLeft: 220,
      width: containerWidth,
      height: Math.max(300, chartData.length * 28),
      x: {
        label: sizeBy === 'fte' ? 'FTE Count' : 'Budget ($)',
        tickFormat: sizeBy === 'budget'
          ? (d: number) => `$${(d / 1_000_000).toFixed(0)}M`
          : undefined,
      },
      y: { label: null },
      color: {
        type: 'diverging',
        scheme: 'RdBu',
        pivot: 0,
        legend: true,
        label: sizeBy === 'fte' ? 'FTE Change' : 'Budget Change',
      },
      marks: [
        Plot.barX(chartData, {
          x: 'value',
          y: 'department',
          fill: 'change',
          sort: { y: '-x' },
          tip: true,
          title: (d: typeof chartData[0]) =>
            `${d.department}\nFTE: ${Math.round(d.fte)} | Budget: $${(d.budget / 1_000_000).toFixed(1)}M\n${d.positions} position types`,
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
      if (i < chartData.length) {
        rect.setAttribute('data-slug', chartData[i].slug);
        rect.style.cursor = 'pointer';
        rect.addEventListener('click', () => {
          window.location.href = `${routePrefix}/sections/${chartData[i].slug}/`;
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
  }, [data, sizeBy, containerWidth]);

  if (data.length === 0) {
    return <div class="text-gray-400 italic py-4">No personnel data available.</div>;
  }

  return (
    <div class="mb-8" ref={containerRef}>
      <div class="flex items-center gap-3 mb-4">
        <h3 class="text-lg font-semibold">Staffing Distribution</h3>
        <select
          class="border rounded px-2 py-1 text-sm"
          value={sizeBy}
          onChange={(e) => setSizeBy((e.target as HTMLSelectElement).value as SizeBy)}
        >
          <option value="fte">FTE Count</option>
          <option value="budget">Budget</option>
        </select>
      </div>
      <p class="text-sm text-gray-500 mb-3">
        Top 20 departments by {sizeBy === 'fte' ? 'headcount' : 'total budget'}.
        Color shows year-over-year change (blue = growth, red = reduction). Hover for details.
      </p>
      <div ref={chartRef} />
    </div>
  );
}
