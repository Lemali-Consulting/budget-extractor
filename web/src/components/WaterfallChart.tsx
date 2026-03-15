/**Waterfall chart showing how revenue components build up to a total.*/

import { useEffect, useRef } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';

interface WaterfallItem {
  label: string;
  amount: number;
  type: string;
}

export default function WaterfallChart({ data }: { data: WaterfallItem[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // Build waterfall data with running totals
    const bars: { label: string; y1: number; y2: number; amount: number; isTotal: boolean }[] = [];
    let cumulative = 0;

    for (const item of data) {
      const y1 = cumulative;
      cumulative += item.amount;
      bars.push({
        label: item.label,
        y1,
        y2: cumulative,
        amount: item.amount,
        isTotal: false,
      });
    }

    // Add total bar
    bars.push({
      label: 'Total Revenue',
      y1: 0,
      y2: cumulative,
      amount: cumulative,
      isTotal: true,
    });

    const chart = Plot.plot({
      width: containerWidth,
      height: 400,
      marginBottom: 80,
      marginLeft: 80,
      x: {
        label: null,
        tickRotate: -35,
        domain: bars.map((b) => b.label),
      },
      y: {
        label: 'Amount ($)',
        tickFormat: (d: number) => `$${(d / 1_000_000).toFixed(0)}M`,
      },
      marks: [
        Plot.barY(bars, {
          x: 'label',
          y1: 'y1',
          y2: 'y2',
          fill: (d: typeof bars[0]) => (d.isTotal ? CHART_COLORS.primary : CHART_COLORS.positive),
          fillOpacity: (d: typeof bars[0]) => (d.isTotal ? 0.8 : 0.7),
        }),
        Plot.text(bars, {
          x: 'label',
          y: (d: typeof bars[0]) => (d.y1 + d.y2) / 2,
          text: (d: typeof bars[0]) => `$${(d.amount / 1_000_000).toFixed(1)}M`,
          fill: 'white',
          fontSize: 10,
          fontWeight: 'bold',
        }),
        Plot.ruleY([0]),
      ],
    });

    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [data, containerWidth]);

  if (data.length === 0) {
    return <div class="text-gray-400 italic py-4">No revenue data available.</div>;
  }

  return (
    <div ref={containerRef}>
      <h3 class="text-lg font-semibold mb-2">2026 Revenue Breakdown</h3>
      <p class="text-sm text-gray-500 mb-4">
        How the city's projected revenue builds up from its component sources.
      </p>
      <div ref={chartRef} />
    </div>
  );
}
