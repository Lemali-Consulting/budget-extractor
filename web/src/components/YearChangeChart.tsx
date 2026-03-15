/**Diverging bar chart showing year-over-year budget changes.*/

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { parseCurrency } from '../lib/currency';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';

interface Props {
  headers: string[];
  rows: string[][];
  numericCols: number[];
  tableId: string;
}

export default function YearChangeChart({ headers, rows, numericCols, tableId }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  // Find consecutive year-column pairs
  const yearCols = numericCols
    .map((i) => {
      const m = headers[i]?.match(/\b(20\d{2})\b/);
      return m ? { idx: i, year: parseInt(m[1]), header: headers[i] } : null;
    })
    .filter((x): x is { idx: number; year: number; header: string } => x !== null)
    .sort((a, b) => a.year - b.year);

  const pairs = yearCols.slice(0, -1).map((a, i) => ({
    from: a,
    to: yearCols[i + 1],
    label: `${a.year} → ${yearCols[i + 1].year}`,
  }));

  const [pairIdx, setPairIdx] = useState(Math.max(0, pairs.length - 1));
  const labelCol = headers.findIndex((_, i) => !numericCols.includes(i));

  useEffect(() => {
    if (!chartRef.current || pairs.length === 0) return;

    const pair = pairs[Math.min(pairIdx, pairs.length - 1)];
    if (!pair) return;

    const data: { label: string; delta: number; pctChange: number }[] = [];

    for (const row of rows) {
      const label = labelCol >= 0 ? (row[labelCol] || 'Row').trim() : 'Row';
      if (label.toLowerCase().includes('total')) continue;

      const fromVal = parseCurrency(row[pair.from.idx] || '');
      const toVal = parseCurrency(row[pair.to.idx] || '');
      if (fromVal === null || toVal === null) continue;

      const delta = toVal - fromVal;
      if (delta === 0) continue;

      const pctChange = fromVal !== 0 ? (delta / Math.abs(fromVal)) * 100 : 0;
      data.push({ label, delta, pctChange });
    }

    if (data.length === 0) {
      chartRef.current.textContent = 'No changes to display.';
      return;
    }

    data.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const sliced = data.slice(0, 25);

    const chart = Plot.plot({
      marginLeft: Math.min(250, Math.max(120, ...sliced.map((d) => d.label.length * 7))),
      width: containerWidth,
      height: Math.max(300, sliced.length * 28),
      x: {
        label: `Change (${pair.from.year} → ${pair.to.year})`,
        tickFormat: (d: number) =>
          Math.abs(d) >= 1_000_000
            ? `$${(d / 1_000_000).toFixed(1)}M`
            : Math.abs(d) >= 1_000
              ? `$${(d / 1_000).toFixed(0)}K`
              : `$${d}`,
      },
      y: { label: null },
      marks: [
        Plot.barX(sliced, {
          x: 'delta',
          y: 'label',
          fill: (d: { delta: number }) => (d.delta >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative),
          sort: { y: 'x' },
        }),
        Plot.text(sliced, {
          x: 'delta',
          y: 'label',
          text: (d: { pctChange: number }) =>
            `${d.pctChange >= 0 ? '+' : ''}${d.pctChange.toFixed(1)}%`,
          dx: (d: { delta: number }) => (d.delta >= 0 ? 4 : -4),
          textAnchor: (d: { delta: number }) => (d.delta >= 0 ? 'start' : 'end'),
          fontSize: 10,
          fill: CHART_COLORS.annotation,
        }),
        Plot.ruleX([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [tableId, pairIdx, containerWidth]);

  if (pairs.length === 0) {
    return <div class="text-gray-400 italic py-4">Need 2+ year columns to show changes.</div>;
  }

  return (
    <div ref={containerRef}>
      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm font-medium text-gray-700">Compare:</label>
        <select
          class="border rounded px-2 py-1 text-sm"
          value={pairIdx}
          onChange={(e) => setPairIdx(Number((e.target as HTMLSelectElement).value))}
        >
          {pairs.map((p, i) => (
            <option key={i} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div ref={chartRef} />
    </div>
  );
}
