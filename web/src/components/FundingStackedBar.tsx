/**Stacked bar chart showing CIP funding sources across years.*/

import { useEffect, useRef } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { parseCurrency } from '../lib/currency';
import { SOURCE_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';

interface Props {
  headers: string[];
  rows: string[][];
  tableId: string;
}

export default function FundingStackedBar({ headers, rows, tableId }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  // Find year columns (skip first "Source" col and last "Total" col)
  const yearCols = headers
    .map((h, i) => ({ h: h.trim(), i }))
    .filter(({ h }) => /^20\d{2}$/.test(h));

  useEffect(() => {
    if (!chartRef.current || yearCols.length === 0) return;

    const data: { year: string; source: string; value: number }[] = [];
    for (const row of rows) {
      const source = (row[0] || '').trim();
      if (source.toLowerCase() === 'total') continue;
      for (const { h: year, i } of yearCols) {
        const value = parseCurrency(row[i] || '') ?? 0;
        if (value > 0) {
          data.push({ year, source, value });
        }
      }
    }

    if (data.length === 0) {
      chartRef.current.textContent = 'No funding data to chart.';
      return;
    }

    const sources = [...new Set(data.map((d) => d.source))];

    const chart = Plot.plot({
      width: containerWidth,
      height: 380,
      marginBottom: 40,
      x: { label: 'Year', type: 'band', padding: 0.3 },
      y: {
        label: 'Funding ($)',
        tickFormat: (d: number) =>
          d >= 1_000_000
            ? `$${(d / 1_000_000).toFixed(1)}M`
            : d >= 1_000
              ? `$${(d / 1_000).toFixed(0)}K`
              : `$${d}`,
      },
      color: {
        domain: sources,
        range: sources.map((s) => SOURCE_COLORS[s] || '#94a3b8'),
        legend: true,
      },
      marks: [
        Plot.barY(data, {
          x: 'year',
          y: 'value',
          fill: 'source',
          order: 'sum',
          tip: {
            format: {
              y: (d: number) => `$${d.toLocaleString()}`,
            },
          },
        }),
        Plot.ruleY([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [tableId, containerWidth]);

  if (yearCols.length === 0) {
    return <div class="text-gray-400 italic py-4">No year columns found for stacked chart.</div>;
  }

  return <div ref={containerRef}><div ref={chartRef} /></div>;
}
