/**Diverging bar chart showing FTE changes by department.*/

import { useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';

interface DeptPersonnel {
  department: string;
  slug: string;
  totalFtePrior: number;
  totalFteCurrent: number;
}

interface Props {
  data: DeptPersonnel[];
  /** Budget year shown and the year it is compared with, for the empty-state text. */
  year: number;
  priorYear: number;
}

export default function PersonnelChangesChart({ data, year, priorYear }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const changes = data
      .map((d) => ({
        department: d.department,
        change: d.totalFteCurrent - d.totalFtePrior,
        fteCurrent: d.totalFteCurrent,
      }))
      .filter((d) => d.change !== 0)
      .sort((a, b) => b.change - a.change);

    if (changes.length === 0) {
      chartRef.current.textContent = `No FTE changes between ${priorYear} and ${year}.`;
      return;
    }

    const chart = Plot.plot({
      marginLeft: 220,
      marginRight: 80,
      width: containerWidth,
      height: Math.max(200, changes.length * 30 + 40),
      x: { label: 'FTE Change' },
      y: { label: null },
      color: {
        domain: [-1, 0, 1],
        range: [CHART_COLORS.negative, CHART_COLORS.neutral, CHART_COLORS.positive],
        type: 'linear',
      },
      marks: [
        Plot.barX(changes, {
          y: 'department',
          x: 'change',
          fill: (d: typeof changes[0]) => (d.change > 0 ? CHART_COLORS.positive : CHART_COLORS.negative),
          sort: { y: '-x' },
          tip: true,
          title: (d: typeof changes[0]) =>
            `${d.department}\n${d.change > 0 ? '+' : ''}${Number.isInteger(d.change) ? d.change : d.change.toFixed(1)} FTE (now ${d.fteCurrent})`,
        }),
        Plot.text(changes, {
          y: 'department',
          x: 'change',
          text: (d: typeof changes[0]) => `${d.change > 0 ? '+' : ''}${Number.isInteger(d.change) ? d.change : d.change.toFixed(1)}`,
          textAnchor: (d: typeof changes[0]) => (d.change >= 0 ? 'start' : 'end'),
          dx: (d: typeof changes[0]) => (d.change >= 0 ? 5 : -5),
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
    return <div class="text-gray-400 italic py-4">No personnel data available.</div>;
  }

  return (
    <div ref={containerRef}>
      <div ref={chartRef} />
    </div>
  );
}
