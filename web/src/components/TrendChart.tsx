/**Line chart showing trends across year columns in a budget table.*/

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';

interface Props {
  headers: string[];
  rows: string[][];
  numericCols: number[];
  tableId: string;
}

function parseCurrency(s: string): number | null {
  if (!s || s === '—' || s === 'varies') return null;
  const neg = s.includes('(') && s.includes(')');
  const cleaned = s.replace(/[$,()]/g, '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return neg ? -num : num;
}

export default function TrendChart({ headers, rows, numericCols, tableId }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'line' | 'area'>('line');

  // Detect year columns among numeric columns
  const yearCols = numericCols
    .map((i) => {
      const m = headers[i]?.match(/\b(20\d{2})\b/);
      return m ? { idx: i, year: parseInt(m[1]) } : null;
    })
    .filter((x): x is { idx: number; year: number } => x !== null)
    .sort((a, b) => a.year - b.year);

  const labelCol = headers.findIndex((_, i) => !numericCols.includes(i));

  useEffect(() => {
    if (!chartRef.current || yearCols.length < 3) return;

    // Transpose: each row becomes a series across years
    const data: { label: string; year: number; value: number }[] = [];
    for (const row of rows) {
      const label = labelCol >= 0 ? (row[labelCol] || 'Row').trim() : 'Row';
      if (label.toLowerCase().includes('total')) continue;

      let hasValue = false;
      for (const { idx, year } of yearCols) {
        const v = parseCurrency(row[idx] || '');
        if (v !== null) {
          data.push({ label, year, value: v });
          hasValue = true;
        }
      }
      if (!hasValue) continue;
    }

    if (data.length === 0) {
      chartRef.current.textContent = 'No trend data available.';
      return;
    }

    // Limit to top 12 series by latest year value
    const seriesMap = new Map<string, number>();
    const maxYear = Math.max(...yearCols.map((c) => c.year));
    for (const d of data) {
      if (d.year === maxYear) seriesMap.set(d.label, Math.abs(d.value));
    }
    const topSeries = [...seriesMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label]) => label);
    const topSet = new Set(topSeries);
    const filtered = data.filter((d) => topSet.has(d.label));

    const marks =
      mode === 'area'
        ? [
            Plot.areaY(filtered, {
              x: 'year',
              y: 'value',
              fill: 'label',
              fillOpacity: 0.3,
              curve: 'monotone-x',
            }),
            Plot.lineY(filtered, {
              x: 'year',
              y: 'value',
              stroke: 'label',
              strokeWidth: 2,
              curve: 'monotone-x',
            }),
          ]
        : [
            Plot.lineY(filtered, {
              x: 'year',
              y: 'value',
              stroke: 'label',
              strokeWidth: 2,
              curve: 'monotone-x',
            }),
            Plot.dot(filtered, {
              x: 'year',
              y: 'value',
              fill: 'label',
              r: 3,
            }),
          ];

    marks.push(Plot.ruleY([0]));

    const chart = Plot.plot({
      width: 700,
      height: 400,
      marginRight: 120,
      x: { label: 'Year', tickFormat: (d: number) => String(d) },
      y: {
        label: 'Amount ($)',
        tickFormat: (d: number) =>
          Math.abs(d) >= 1_000_000
            ? `$${(d / 1_000_000).toFixed(1)}M`
            : Math.abs(d) >= 1_000
              ? `$${(d / 1_000).toFixed(0)}K`
              : `$${d}`,
      },
      color: { legend: true },
      marks,
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [tableId, mode]);

  if (yearCols.length < 3) {
    return <div class="text-gray-400 italic py-4">Need 3+ year columns for trend chart.</div>;
  }

  return (
    <div>
      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm font-medium text-gray-700">Style:</label>
        <select
          class="border rounded px-2 py-1 text-sm"
          value={mode}
          onChange={(e) => setMode((e.target as HTMLSelectElement).value as 'line' | 'area')}
        >
          <option value="line">Line</option>
          <option value="area">Area</option>
        </select>
      </div>
      <div ref={chartRef} />
    </div>
  );
}
