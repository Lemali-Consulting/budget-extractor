/**Bar chart panel for a selected numeric column of a budget table.*/

import { useEffect, useRef } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { parseCurrency } from '../../lib/currency';
import { CHART_COLORS } from '../../lib/chart-colors';
import { useContainerWidth } from '../../lib/hooks';

interface Props {
  headers: string[];
  rows: string[][];
  numericCols: number[];
  chartCol: number;
  onChartColChange: (col: number) => void;
  tableId: string;
}

export default function ChartPanel({ headers, rows, numericCols, chartCol, onChartColChange, tableId }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const labelCol = headers.findIndex((_, i) => !numericCols.includes(i));

  useEffect(() => {
    if (!chartRef.current || chartCol < 0) return;

    const chartData = rows
      .map((row) => ({
        label: labelCol >= 0 ? (row[labelCol] || 'Row') : 'Row',
        value: parseCurrency(row[chartCol] || '') ?? 0,
      }))
      .filter((d) => d.value !== 0 && !d.label.toLowerCase().includes('total'));

    if (chartData.length === 0) {
      chartRef.current.textContent = 'No chartable data in this column.';
      return;
    }

    chartData.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const sliced = chartData.slice(0, 25);

    const chart = Plot.plot({
      marginLeft: Math.min(250, Math.max(120, ...sliced.map((d) => d.label.length * 7))),
      width: containerWidth,
      height: Math.max(300, sliced.length * 28),
      x: {
        label: headers[chartCol] || `Column ${chartCol + 1}`,
        tickFormat: (d: number) =>
          Math.abs(d) >= 1_000_000
            ? `$${(d / 1_000_000).toFixed(1)}M`
            : Math.abs(d) >= 1_000
              ? `$${(d / 1_000).toFixed(0)}K`
              : `${d}`,
      },
      y: { label: null },
      marks: [
        Plot.barX(sliced, {
          x: 'value',
          y: 'label',
          fill: (d: { value: number }) => (d.value >= 0 ? CHART_COLORS.primary : CHART_COLORS.negative),
          sort: { y: '-x' },
        }),
        Plot.ruleX([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [chartCol, tableId, containerWidth]);

  return (
    <div ref={containerRef}>
      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm font-medium text-gray-700">Column:</label>
        <select
          class="border rounded px-2 py-1 text-sm"
          value={chartCol}
          onChange={(e) => onChartColChange(Number((e.target as HTMLSelectElement).value))}
        >
          {numericCols.map((i) => (
            <option key={i} value={i}>
              {headers[i] || `Column ${i + 1}`}
            </option>
          ))}
        </select>
      </div>
      <div ref={chartRef} />
    </div>
  );
}
