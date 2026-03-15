/**Bar chart showing department budget increases or decreases.*/
import { useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';

interface DeptChange {
  department: string;
  slug: string;
  dollarChange: number;
  pctChange: number;
}

interface Props {
  data: DeptChange[];
  title: string;
  color: string;
}

function formatDollar(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function ChangesChart({ data, title, color }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;

    const sorted = [...data].sort((a, b) => Math.abs(b.dollarChange) - Math.abs(a.dollarChange));

    const chart = Plot.plot({
      marginLeft: 200,
      marginRight: 80,
      height: Math.max(200, sorted.length * 32 + 40),
      x: { label: 'Dollar Change', tickFormat: (d: number) => formatDollar(d) },
      y: { label: null },
      marks: [
        Plot.barX(sorted, {
          y: (d: DeptChange) => d.department,
          x: (d: DeptChange) => d.dollarChange,
          fill: color,
          sort: { y: '-x' },
        }),
        Plot.text(sorted, {
          y: (d: DeptChange) => d.department,
          x: (d: DeptChange) => d.dollarChange,
          text: (d: DeptChange) => `${formatDollar(d.dollarChange)} (${d.pctChange > 0 ? '+' : ''}${d.pctChange}%)`,
          textAnchor: (d: DeptChange) => d.dollarChange >= 0 ? 'start' : 'end',
          dx: (d: DeptChange) => d.dollarChange >= 0 ? 4 : -4,
          fontSize: 11,
        }),
        Plot.ruleX([0]),
      ],
    });

    ref.current.innerHTML = '';
    ref.current.appendChild(chart);

    return () => chart.remove();
  }, [data]);

  return (
    <div class="bg-white rounded-lg border p-4 mb-6">
      <h3 class="text-lg font-semibold mb-3">{title}</h3>
      {data.length === 0
        ? <p class="text-gray-400 italic text-sm">No changes found.</p>
        : <div ref={ref} />
      }
    </div>
  );
}
