/**Bar chart showing department budget increases or decreases.*/
import { useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { useContainerWidth } from '../lib/hooks';

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

// Shorten common department prefixes so labels fit a reduced left margin on
// narrow viewports. The full name still appears in the tooltip.
function shortDept(name: string): string {
  return name
    .replace(/^Department of\s+/i, 'Dept. of ')
    .replace(/^Bureau of\s+/i, '')
    .replace(/^Office of\s+/i, '')
    .replace(/\bAdministration\b/i, 'Admin.')
    .replace(/\bDevelopment\b/i, 'Dev.')
    .replace(/\bManagement\b/i, 'Mgmt.')
    .replace(/\bServices\b/i, 'Svcs.')
    .replace(/\bInfrastructure\b/i, 'Infra.');
}

export default function ChangesChart({ data, title, color }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  useEffect(() => {
    if (!ref.current || data.length === 0) return;

    const isNarrow = containerWidth < 520;
    const sorted = [...data]
      .sort((a, b) => Math.abs(b.dollarChange) - Math.abs(a.dollarChange))
      .map((d) => ({ ...d, displayName: isNarrow ? shortDept(d.department) : d.department }));

    const hasPositive = sorted.some((d) => d.dollarChange >= 0);
    const hasNegative = sorted.some((d) => d.dollarChange < 0);
    // Labels sit outside bar ends: right for positive, left for negative.
    // For all-negative charts, labels go to the right of zero to avoid colliding with y-axis labels.
    const longestLabel = Math.max(
      ...sorted.map((d) => `${formatDollar(d.dollarChange)} (${d.pctChange > 0 ? '+' : ''}${d.pctChange}%)`.length),
    );
    const labelWidth = Math.min(140, longestLabel * 7 + 10);

    // Shrink margins on narrow viewports so the plot area stays positive.
    // Without this, marginLeft (200) + marginRight (~140) exceed mobile widths
    // and Plot emits bars with negative width attributes.
    const MIN_INNER = 80;
    let marginLeft = 200;
    let marginRight = hasPositive || hasNegative ? labelWidth : 40;
    const overflow = marginLeft + marginRight + MIN_INNER - containerWidth;
    if (overflow > 0) {
      const leftShrink = Math.min(overflow, marginLeft - 90);
      marginLeft -= Math.max(0, leftShrink);
      const remaining = overflow - Math.max(0, leftShrink);
      if (remaining > 0) marginRight = Math.max(40, marginRight - remaining);
    }

    const chart = Plot.plot({
      marginLeft,
      marginRight,
      width: containerWidth,
      height: Math.max(200, sorted.length * 32 + 40),
      x: { label: 'Dollar Change', tickFormat: (d: number) => formatDollar(d) },
      y: { label: null },
      marks: [
        Plot.barX(sorted, {
          y: 'displayName',
          x: 'dollarChange',
          fill: color,
          sort: { y: '-x' },
          tip: true,
          title: (d) =>
            `${d.department}\n${formatDollar(d.dollarChange)} (${d.pctChange > 0 ? '+' : ''}${d.pctChange}%)`,
        }),
        Plot.text(
          sorted.filter((d) => d.dollarChange >= 0),
          {
            y: 'displayName',
            x: 'dollarChange',
            text: (d) => `${formatDollar(d.dollarChange)} (+${d.pctChange}%)`,
            textAnchor: 'start',
            dx: 5,
            fontSize: 12,
            fill: '#374151',
          },
        ),
        Plot.text(
          sorted.filter((d) => d.dollarChange < 0),
          {
            y: 'displayName',
            x: 0,
            text: (d) => `${formatDollar(d.dollarChange)} (${d.pctChange}%)`,
            textAnchor: 'start',
            dx: 5,
            fontSize: 12,
            fill: '#374151',
          },
        ),
        Plot.ruleX([0]),
      ],
    });

    ref.current.innerHTML = '';
    ref.current.appendChild(chart);

    // Make bars clickable — navigate to section detail pages
    // Observable Plot sets fill on a parent <g>, not individual rects
    const barRects = Array.from(chart.querySelectorAll('rect')).filter(
      (r) => r.parentElement?.getAttribute('fill') === color,
    );
    barRects.forEach((rect, i) => {
      if (i < sorted.length) {
        rect.setAttribute('data-slug', sorted[i].slug);
        rect.style.cursor = 'pointer';
        rect.addEventListener('click', () => {
          window.location.href = `/sections/${sorted[i].slug}/`;
        });
        rect.addEventListener('mouseenter', () => {
          rect.setAttribute('opacity', '0.7');
        });
        rect.addEventListener('mouseleave', () => {
          rect.removeAttribute('opacity');
        });
      }
    });

    return () => chart.remove();
  }, [data, containerWidth]);

  return (
    <div ref={containerRef} class="bg-white rounded-lg border p-4 mb-6">
      <h3 class="text-lg font-semibold mb-3">{title}</h3>
      {data.length === 0
        ? <p class="text-gray-400 italic text-sm">No changes found.</p>
        : <div ref={ref} />
      }
    </div>
  );
}
