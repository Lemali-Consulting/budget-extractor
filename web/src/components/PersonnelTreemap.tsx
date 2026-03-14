/**Bar chart showing staffing (FTE or budget) per department with change indicators.*/

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';

interface DeptData {
  department: string;
  slug: string;
  totalFte2025: number;
  totalFte2026: number;
  totalBudget2025: number;
  totalBudget2026: number;
  positionCount: number;
}

type SizeBy = 'fte' | 'budget';

export default function PersonnelTreemap({ data }: { data: DeptData[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [sizeBy, setSizeBy] = useState<SizeBy>('fte');

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chartData = data
      .map((d) => ({
        department: d.department,
        value: sizeBy === 'fte' ? d.totalFte2026 : d.totalBudget2026,
        change: sizeBy === 'fte'
          ? d.totalFte2026 - d.totalFte2025
          : d.totalBudget2026 - d.totalBudget2025,
        fte: d.totalFte2026,
        budget: d.totalBudget2026,
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
      width: 700,
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
          title: (d: typeof chartData[0]) =>
            `${d.department}\nFTE: ${d.fte} | Budget: $${(d.budget / 1_000_000).toFixed(1)}M\n${d.positions} position types`,
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
    return () => chart.remove();
  }, [data, sizeBy]);

  if (data.length === 0) {
    return <div class="text-gray-400 italic py-4">No personnel data available.</div>;
  }

  return (
    <div class="mb-8">
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
