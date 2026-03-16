/**Visual breakdown of where each tax dollar goes, as a stacked horizontal bar.*/

import { useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { useContainerWidth } from '../lib/hooks';

interface DeptShare {
  label: string;
  cents: number;
}

const COLORS = [
  '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd',
  '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6b7280',
];

export default function TaxDollarChart({ data }: { data: DeptShare[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = Plot.plot({
      width: containerWidth,
      height: Math.max(300, data.length * 32 + 20),
      marginLeft: 220,
      marginRight: 80,
      x: {
        label: 'Cents per dollar',
        tickFormat: (d: number) => `${d.toFixed(0)}¢`,
      },
      y: { label: null },
      marks: [
        Plot.barX(data, {
          y: 'label',
          x: 'cents',
          fill: (_d: any, i: number) => COLORS[i % COLORS.length],
          sort: { y: '-x' },
          tip: true,
          title: (d: DeptShare) => `${d.label}: ${d.cents.toFixed(1)}¢ per dollar`,
        }),
        Plot.text(data, {
          y: 'label',
          x: 'cents',
          text: (d: DeptShare) => `${d.cents.toFixed(1)}¢`,
          textAnchor: 'start',
          dx: 5,
          fontSize: 12,
          fill: '#374151',
        }),
        Plot.ruleX([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [data, containerWidth]);

  return (
    <div ref={containerRef}>
      <div ref={chartRef} />
    </div>
  );
}
