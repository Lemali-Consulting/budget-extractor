/**Stacked bar chart showing capital funding by source (CDBG, BOND, PAYGO, OTHER).*/

import { useEffect, useRef } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { SOURCE_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';

interface FundingRow {
  project: string;
  source: string;
  year: string;
  amount: number;
}

export default function FundingSourceChart({ data }: { data: FundingRow[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // Aggregate by source + year
    const agg = new Map<string, number>();
    for (const d of data) {
      const key = `${d.source}|${d.year}`;
      agg.set(key, (agg.get(key) || 0) + d.amount);
    }

    const chartData = [...agg.entries()]
      .map(([key, amount]) => {
        const [source, year] = key.split('|');
        return { source, year, amount };
      })
      .filter((d) => d.amount > 0)
      .sort((a, b) => a.year.localeCompare(b.year));

    if (chartData.length === 0) {
      chartRef.current.textContent = 'No funding data available.';
      return;
    }

    const sources = [...new Set(chartData.map((d) => d.source))];

    const chart = Plot.plot({
      width: containerWidth,
      height: 350,
      marginBottom: 40,
      x: { label: 'Year', type: 'band', padding: 0.3 },
      y: {
        label: 'Total funding ($)',
        tickFormat: (d: number) => `$${(d / 1_000_000).toFixed(0)}M`,
      },
      color: {
        domain: sources,
        range: sources.map((s) => SOURCE_COLORS[s] || '#9ca3af'),
        legend: true,
      },
      marks: [
        Plot.barY(chartData, Plot.stackY({ x: 'year', y: 'amount', fill: 'source' })),
        Plot.ruleY([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [data, containerWidth]);

  if (data.length === 0) {
    return <div class="text-gray-400 italic py-4">No capital funding data available.</div>;
  }

  const planYears = data.map((d) => d.year).sort();
  const planRange = `${planYears[0]}-${planYears[planYears.length - 1]}`;

  return (
    <div ref={containerRef}>
      <h3 class="text-lg font-semibold mb-3">Funding by source ({planRange})</h3>
      <div ref={chartRef} />
    </div>
  );
}
