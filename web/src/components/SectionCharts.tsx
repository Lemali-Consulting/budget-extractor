/**
 * Charts panel for a budget section page: trend and category breakdown, both
 * plotting the PDF's own figures. A year-over-year tab that charted our own
 * row-by-row subtraction was removed (Max, 2026-11-12).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { parseCurrency, formatDollar } from '../lib/currency';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';
import { columnHeaderLabel } from '../lib/text-case';
import { trendPoints } from '../lib/section-trend';

interface TableData {
  id: string;
  table_type: string;
  headers: string[];
  rows: string[][];
  /** Each row's display name in house style (chartRowLabels). */
  rowLabels: string[];
}

interface Props {
  tables: TableData[];
  sectionTitle: string;
  /** Budget year of the page; the breakdown tab charts that year's column. */
  year: number;
}

type Tab = 'trend' | 'breakdown';

/** Width kept clear right of the bars for the value printed past each one ("$160.0M"). */
const VALUE_LABEL_MARGIN = 56;

export default function SectionCharts({ tables, sectionTitle, year }: Props) {
  const [tab, setTab] = useState<Tab>('trend');
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  // Find the best table for charts: prefer financial_summary, then financial
  const summaryTable =
    tables.find((t) => t.table_type === 'financial_summary') ||
    tables.find((t) => t.table_type === 'financial');

  if (!summaryTable) return null;

  const headers = summaryTable.headers;
  const rows = summaryTable.rows;
  const rowLabels = summaryTable.rowLabels;

  // Detect numeric columns
  const numericCols = headers
    .map((h, i) => {
      if (i === 0) return -1;
      const hasNum = rows.some((r) => parseCurrency(r[i] || '') !== null);
      return hasNum ? i : -1;
    })
    .filter((i) => i >= 0);

  // Detect year columns
  const yearCols = numericCols
    .map((i) => {
      const m = headers[i]?.match(/\b(20\d{2})\b/);
      return m ? { idx: i, year: parseInt(m[1]), header: headers[i] } : null;
    })
    .filter((x): x is { idx: number; year: number; header: string } => x !== null)
    .sort((a, b) => a.year - b.year);

  const hasTrend = yearCols.length >= 2;

  // Find the current-year Budget column for breakdown (fallback to last year col)
  const breakdownCol =
    yearCols.find((c) => c.header.includes(String(year)))?.idx ??
    (yearCols.length > 0 ? yearCols[yearCols.length - 1].idx : -1);
  const hasBreakdown = breakdownCol >= 0;

  const availableTabs: { key: Tab; label: string }[] = [];
  if (hasTrend) availableTabs.push({ key: 'trend', label: 'Budget trend' });
  if (hasBreakdown) availableTabs.push({ key: 'breakdown', label: 'Breakdown' });

  if (availableTabs.length === 0) return null;

  // Default to first available tab
  const activeTab = availableTabs.find((t) => t.key === tab) ? tab : availableTabs[0].key;

  useEffect(() => {
    if (!chartRef.current) return;

    if (activeTab === 'trend') {
      renderTrend(chartRef.current);
    } else if (activeTab === 'breakdown') {
      renderBreakdown(chartRef.current);
    }
  }, [activeTab, containerWidth]);

  function renderTrend(el: HTMLDivElement) {
    const data = trendPoints({ rows, rowLabels, yearColumns: yearCols });
    if (data.length === 0) {
      el.textContent = 'No trend data available.';
      return;
    }

    // Top 10 series by latest year
    const maxYear = Math.max(...yearCols.map((c) => c.year));
    const seriesMap = new Map<string, number>();
    for (const d of data) {
      if (d.year === maxYear) seriesMap.set(d.label, Math.abs(d.value));
    }
    const topSeries = [...seriesMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label]) => label);
    const topSet = new Set(topSeries);
    const filtered = data.filter((d) => topSet.has(d.label));

    const chart = Plot.plot({
      width: containerWidth,
      height: 350,
      marginRight: 100,
      x: { label: 'Year', tickFormat: (d: number) => String(d), ticks: yearCols.map((c) => c.year) },
      y: { label: 'Amount ($)', tickFormat: formatDollar },
      color: { legend: true },
      marks: [
        Plot.lineY(filtered, {
          x: 'year',
          y: 'value',
          stroke: 'label',
          strokeWidth: 2,
          curve: 'monotone-x',
        }),
        Plot.dot(filtered, {
          x: 'year',
          y: 'value',
          fill: 'label',
          r: 3,
        }),
        Plot.ruleY([0]),
      ],
    });
    el.replaceChildren(chart);
  }

  function renderBreakdown(el: HTMLDivElement) {
    const data: { label: string; amount: number }[] = [];
    for (const [i, row] of rows.entries()) {
      const label = rowLabels[i];
      if (!label || label.toLowerCase().includes('total')) continue;
      const val = parseCurrency(row[breakdownCol] || '');
      if (val !== null && val !== 0) data.push({ label, amount: val });
    }

    if (data.length === 0) {
      el.textContent = 'No breakdown data available.';
      return;
    }

    data.sort((a, b) => b.amount - a.amount);
    const sliced = data.slice(0, 20);
    const colHeader = columnHeaderLabel(headers[breakdownCol] || 'Budget');

    const chart = Plot.plot({
      marginLeft: Math.min(220, Math.max(100, ...sliced.map((d) => d.label.length * 6.5))),
      marginRight: VALUE_LABEL_MARGIN,
      width: containerWidth,
      height: Math.max(250, sliced.length * 26),
      x: { label: colHeader, tickFormat: formatDollar },
      y: { label: null },
      marks: [
        Plot.barX(sliced, {
          x: 'amount',
          y: 'label',
          fill: CHART_COLORS.primary,
          sort: { y: '-x' },
        }),
        Plot.text(sliced, {
          x: 'amount',
          y: 'label',
          text: (d: { amount: number }) => formatDollar(d.amount),
          dx: 4,
          textAnchor: 'start',
          fontSize: 10,
        }),
        Plot.ruleX([0]),
      ],
    });
    el.replaceChildren(chart);
  }

  return (
    <div class="mb-8 bg-white rounded-lg border overflow-hidden" ref={containerRef} data-testid="section-charts">
      <div class="flex border-b bg-gray-50" role="tablist">
        {availableTabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            class={`px-4 py-2 text-sm font-medium transition ${
              activeTab === t.key
                ? 'text-ps-blue-700 border-b-2 border-ps-blue-600 bg-white'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div class="p-4 min-h-[300px]" ref={chartRef} />
    </div>
  );
}
