/**Bar chart comparing budget figures across departments using Observable Plot.*/

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';

interface BudgetRow {
  department: string;
  slug: string;
  year: string;
  amount: number;
}

export default function BudgetChart({ data }: { data: BudgetRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const [selectedYear, setSelectedYear] = useState<string>('');

  const years = [...new Set(data.map((d) => d.year))].sort();

  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[years.length - 1]);
    }
  }, [years]);

  useEffect(() => {
    if (!containerRef.current || !selectedYear) return;

    const filtered = data
      .filter((d) => d.year === selectedYear)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    if (filtered.length === 0) {
      containerRef.current.textContent = 'No budget data available for this year.';
      return;
    }

    const chart = Plot.plot({
      marginLeft: 220,
      width: containerWidth,
      height: Math.max(300, filtered.length * 30),
      x: { label: 'Amount ($)', tickFormat: (d: number) => `$${(d / 1_000_000).toFixed(1)}M` },
      y: { label: null },
      marks: [
        Plot.barX(filtered, {
          x: 'amount',
          y: 'department',
          fill: CHART_COLORS.primary,
          sort: { y: '-x' },
        }),
        Plot.text(filtered, {
          x: 'amount',
          y: 'department',
          text: (d: BudgetRow) => `$${(d.amount / 1_000_000).toFixed(1)}M`,
          dx: 4,
          textAnchor: 'start',
          fontSize: 11,
        }),
        Plot.ruleX([0]),
      ],
    });

    // Insert chart before the controls
    const chartContainer = containerRef.current.querySelector('[data-chart]');
    if (chartContainer) {
      chartContainer.replaceChildren(chart);
    }
    return () => chart.remove();
  }, [selectedYear, data, containerWidth]);

  if (data.length === 0) {
    return (
      <div class="text-gray-400 italic py-4">
        No comparable budget totals found across sections.
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm font-medium text-gray-700">Year:</label>
        <select
          class="border rounded px-2 py-1 text-sm"
          value={selectedYear}
          onChange={(e) => setSelectedYear((e.target as HTMLSelectElement).value)}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div data-chart />
    </div>
  );
}
