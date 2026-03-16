/**Treemap-style chart showing where the city's money goes by department.*/

import { useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { useContainerWidth } from '../lib/hooks';

interface BudgetRow {
  department: string;
  slug: string;
  year: string;
  amount: number;
}

const COLORS = [
  '#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48',
];

function formatDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function SpendingPieChart({ data }: { data: BudgetRow[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // Get 2026 budget by department, sorted by amount
    const depts = data
      .filter((d) => d.year === '2026 Budget')
      .sort((a, b) => b.amount - a.amount);

    if (depts.length === 0) return;

    const total = depts.reduce((s, d) => s + d.amount, 0);

    // Top 10 + "All Other"
    const top = depts.slice(0, 10);
    const otherAmount = depts.slice(10).reduce((s, d) => s + d.amount, 0);
    const display = [
      ...top.map((d) => ({ label: d.department, amount: d.amount, pct: (d.amount / total) * 100 })),
      ...(otherAmount > 0
        ? [{ label: `All Other (${depts.length - 10} depts)`, amount: otherAmount, pct: (otherAmount / total) * 100 }]
        : []),
    ];

    const chart = Plot.plot({
      marginLeft: 220,
      marginRight: 100,
      width: containerWidth,
      height: Math.max(300, display.length * 36 + 20),
      x: {
        label: null,
        tickFormat: (d: number) => `${d.toFixed(0)}%`,
      },
      y: { label: null },
      marks: [
        Plot.barX(display, {
          y: 'label',
          x: 'pct',
          fill: (_d: any, i: number) => COLORS[i % COLORS.length],
          sort: { y: '-x' },
          tip: true,
          title: (d: typeof display[0]) => `${d.label}\n${formatDollar(d.amount)} (${d.pct.toFixed(1)}%)`,
        }),
        Plot.text(display, {
          y: 'label',
          x: 'pct',
          text: (d: typeof display[0]) => `${formatDollar(d.amount)} (${d.pct.toFixed(1)}%)`,
          textAnchor: 'start',
          dx: 5,
          fontSize: 11,
          fill: '#374151',
        }),
        Plot.ruleX([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [data, containerWidth]);

  if (data.length === 0) {
    return <div class="text-gray-400 italic py-4">No budget data available.</div>;
  }

  return (
    <div ref={containerRef}>
      <div ref={chartRef} />
    </div>
  );
}
