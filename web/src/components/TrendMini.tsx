/**Compact sparkline-style trend chart for budget over multiple years.*/

import { useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';

interface TrendPoint {
  year: string;
  amount: number;
}

interface Props {
  data: TrendPoint[];
  height?: number;
  /** Year whose bar is drawn in the primary color; others are muted. */
  highlightYear: number;
}

export default function TrendMini({ data, height = 180, highlightYear }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = Plot.plot({
      width: containerWidth,
      height,
      marginLeft: 70,
      marginBottom: 30,
      x: { label: null, type: 'band', padding: 0.3 },
      y: {
        label: null,
        tickFormat: (d: number) => `$${(d / 1_000_000).toFixed(0)}M`,
        grid: true,
      },
      marks: [
        Plot.barY(data, {
          x: 'year',
          y: 'amount',
          fill: (d: TrendPoint) => d.year.includes(String(highlightYear)) ? CHART_COLORS.primary : '#93c5fd',
          tip: true,
          title: (d: TrendPoint) => `${d.year}: $${(d.amount / 1_000_000).toFixed(1)}M`,
        }),
        Plot.text(data, {
          x: 'year',
          y: 'amount',
          text: (d: TrendPoint) => `$${(d.amount / 1_000_000).toFixed(1)}M`,
          dy: -8,
          fontSize: 11,
          fill: '#374151',
        }),
        Plot.ruleY([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [data, containerWidth, height]);

  if (data.length === 0) {
    return <div class="text-gray-400 italic text-sm">No trend data available.</div>;
  }

  return (
    <div ref={containerRef}>
      <div ref={chartRef} />
    </div>
  );
}
