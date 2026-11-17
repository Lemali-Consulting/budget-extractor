/**Bar chart comparing budget figures across departments using Observable Plot.*/

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';
import { sentenceCase } from '../lib/text-case';

interface BudgetRow {
  department: string;
  slug: string;
  year: string;
  amount: number;
}

/** Width kept clear right of the bars for the value printed past the longest one ("$160.0M"). */
const VALUE_LABEL_MARGIN = 56;

/**
 * Open a department's page from its bar. Framed in another site's story (an
 * embed), it opens in a new tab so the story stays where the reader left it.
 */
function openDepartmentPage(href: string): void {
  if (window.self !== window.top) window.open(href, '_blank', 'noopener');
  else window.location.href = href;
}

/** sectionHrefs: published page per department slug (see publishedSectionHrefs); bars without one aren't clickable. */
export default function BudgetChart({ data, sectionHrefs }: { data: BudgetRow[]; sectionHrefs: Record<string, string> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const [selectedYear, setSelectedYear] = useState<string>('');

  const years = [...new Set(data.map((d) => d.year))].sort();

  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[years.length - 1]);
    }
  }, [years]);

  useEffect(() => {
    if (!containerRef.current || !selectedYear) return;

    const filtered = data
      .filter((d) => d.year === selectedYear)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    if (filtered.length === 0) {
      containerRef.current.textContent = 'No budget data available for this year.';
      return;
    }

    const chart = Plot.plot({
      marginLeft: 220,
      marginRight: VALUE_LABEL_MARGIN,
      width: containerWidth,
      height: Math.max(300, filtered.length * 30),
      x: { label: 'Amount ($)', tickFormat: (d: number) => `$${(d / 1_000_000).toFixed(1)}M` },
      y: { label: null },
      marks: [
        Plot.barX(filtered, {
          x: 'amount',
          y: 'department',
          fill: CHART_COLORS.primary,
          sort: { y: '-x' },
          tip: true,
          title: (d: BudgetRow) => `${d.department}\n$${(d.amount / 1_000_000).toFixed(1)}M`,
        }),
        Plot.text(filtered, {
          x: 'amount',
          y: 'department',
          text: (d: BudgetRow) => `$${(d.amount / 1_000_000).toFixed(1)}M`,
          dx: 4,
          textAnchor: 'start',
          fontSize: 11,
        }),
        Plot.ruleX([0]),
      ],
    });

    // Make bars clickable — navigate to section detail pages
    // Observable Plot sets fill on a parent <g>, not individual rects
    const barRects = Array.from(chart.querySelectorAll('rect')).filter(
      (r) => r.parentElement?.getAttribute('fill') === CHART_COLORS.primary,
    );
    barRects.forEach((rect, i) => {
      const href = i < filtered.length ? sectionHrefs[filtered[i].slug] : undefined;
      if (href) {
        rect.setAttribute('data-slug', filtered[i].slug);
        rect.style.cursor = 'pointer';
        rect.addEventListener('click', () => {
          openDepartmentPage(href);
        });
        rect.addEventListener('mouseenter', () => {
          rect.setAttribute('opacity', '0.7');
        });
        rect.addEventListener('mouseleave', () => {
          rect.removeAttribute('opacity');
        });
      }
    });

    // Insert chart before the controls
    const chartContainer = containerRef.current.querySelector('[data-chart]');
    if (chartContainer) {
      chartContainer.replaceChildren(chart);
    }
    return () => chart.remove();
  }, [selectedYear, data, containerWidth]);

  if (data.length === 0) {
    return (
      <div class="text-gray-400 italic py-4">
        No comparable budget totals found across sections.
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm font-medium text-gray-700">Year:</label>
        <select
          class="border rounded px-2 py-1 text-sm"
          value={selectedYear}
          onChange={(e) => setSelectedYear((e.target as HTMLSelectElement).value)}
        >
          {years.map((y) => (
            <option key={y} value={y}>{sentenceCase(y)}</option>
          ))}
        </select>
      </div>
      <div data-chart />
    </div>
  );
}
