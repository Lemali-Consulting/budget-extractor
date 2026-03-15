/**Interactive data explorer for browsing, charting, comparing, and exporting budget tables.*/

import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import PageImage from './PageImage';
import TrendChart from './TrendChart';
import YearChangeChart from './YearChangeChart';
import FundingStackedBar from './FundingStackedBar';
import { parseCurrency } from '../lib/currency';
import { TYPE_COLORS, TYPE_LABELS, typeLabel } from '../lib/type-colors';
import { CHART_COLORS } from '../lib/chart-colors';
import { useContainerWidth } from '../lib/hooks';

// --- Types ---

interface TableIndex {
  id: string;
  sectionNumber: number;
  sectionTitle: string;
  sectionSlug: string;
  page: number;
  tableIndex: number;
  type: string;
  label?: string;
  headers: string[];
  rowCount: number;
  numericCols: number[];
  budgetType?: string;
}

interface Table {
  id: string;
  relative_page: number;
  table_index: number;
  table_type: string;
  headers: string[];
  rows: string[][];
  sections?: string[];
  absolute_page?: number;
}

interface Section {
  section_number: number;
  title: string;
  slug: string;
  tables: Table[];
}

interface Props {
  tablesIndex: TableIndex[];
  sections: Section[];
}

type Tab = 'data' | 'chart' | 'funding' | 'trend' | 'changes' | 'compare';

const TAB_LABELS: Record<Tab, string> = {
  data: 'Table Data',
  chart: 'Chart',
  funding: 'Funding',
  trend: 'Trend',
  changes: 'Changes',
  compare: 'Compare',
};

// --- Helpers ---

function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const lines = [headers, ...rows].map((r) =>
    r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')
  );
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Chart Sub-Component (needs its own hooks) ---

function ChartPanel({
  table,
  numericCols,
  chartCol,
  onChartColChange,
  tableId,
}: {
  table: Table;
  numericCols: number[];
  chartCol: number;
  onChartColChange: (col: number) => void;
  tableId: string;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);
  const labelCol = table.headers.findIndex((_, i) => !numericCols.includes(i));

  useEffect(() => {
    if (!chartRef.current || chartCol < 0) return;

    const chartData = table.rows
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
        label: table.headers[chartCol],
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
              {table.headers[i]}
            </option>
          ))}
        </select>
      </div>
      <div ref={chartRef} />
    </div>
  );
}

// --- Main Component ---

export default function DataExplorer({ tablesIndex, sections }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('data');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [budgetFilter, setBudgetFilter] = useState<'' | 'operating' | 'capital'>('');
  const [chartCol, setChartCol] = useState<number>(-1);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Build lookup: table id -> full table data
  const tableData = useMemo(() => {
    const map = new Map<string, { table: Table; sectionTitle: string; slug: string }>();
    for (const section of sections) {
      for (const table of section.tables) {
        map.set(table.id, { table, sectionTitle: section.title, slug: section.slug });
      }
    }
    return map;
  }, [sections]);

  // Filter tables by search + type + budget type
  const filtered = useMemo(() => {
    let items = tablesIndex;
    if (budgetFilter) items = items.filter((t) => (t.budgetType || 'operating') === budgetFilter);
    if (typeFilter) items = items.filter((t) => t.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (t) =>
          t.sectionTitle.toLowerCase().includes(q) ||
          t.headers.some((h) => h.toLowerCase().includes(q))
      );
    }
    return items;
  }, [tablesIndex, search, typeFilter, budgetFilter]);

  // Group filtered tables by section (composite key to avoid operating/capital collisions)
  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; slug: string; budgetType: string; tables: TableIndex[] }>();
    for (const t of filtered) {
      const bt = t.budgetType || 'operating';
      const key = `${bt}:${t.sectionNumber}`;
      if (!map.has(key)) {
        map.set(key, { title: t.sectionTitle, slug: t.sectionSlug, budgetType: bt, tables: [] });
      }
      map.get(key)!.tables.push(t);
    }
    // Sort: operating first, then capital; within each, by section number
    return [...map.entries()].sort((a, b) => {
      const aType = a[1].budgetType;
      const bType = b[1].budgetType;
      if (aType !== bType) return aType === 'operating' ? -1 : 1;
      const aNum = parseInt(a[0].split(':')[1]);
      const bNum = parseInt(b[0].split(':')[1]);
      return aNum - bNum;
    });
  }, [filtered]);

  // Budget type counts
  const budgetCounts = useMemo(() => {
    const counts = { operating: 0, capital: 0 };
    for (const t of tablesIndex) {
      const bt = (t.budgetType || 'operating') as keyof typeof counts;
      if (bt in counts) counts[bt]++;
    }
    return counts;
  }, [tablesIndex]);

  // Type counts for filter chips (scoped to current budget filter)
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const base = budgetFilter
      ? tablesIndex.filter((t) => (t.budgetType || 'operating') === budgetFilter)
      : tablesIndex;
    for (const t of base) {
      counts.set(t.type, (counts.get(t.type) || 0) + 1);
    }
    return counts;
  }, [tablesIndex, budgetFilter]);

  // Selected table metadata + data
  const selectedMeta = selectedId ? tablesIndex.find((t) => t.id === selectedId) : null;
  const selectedFull = selectedId ? tableData.get(selectedId) : null;
  const compareFull = compareId ? tableData.get(compareId) : null;

  // URL hash sync
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setSelectedId(hash);
      // Expand the section containing this table
      const meta = tablesIndex.find((t) => t.id === hash);
      if (meta) {
        const key = `${meta.budgetType || 'operating'}:${meta.sectionNumber}`;
        setExpandedSections(new Set([key]));
      }
    }
  }, []);

  useEffect(() => {
    if (selectedId) window.location.hash = selectedId;
  }, [selectedId]);

  // Reset chart column when selection changes
  useEffect(() => {
    if (selectedMeta && selectedMeta.numericCols.length > 0) {
      setChartCol(selectedMeta.numericCols[0]);
    } else {
      setChartCol(-1);
    }
  }, [selectedId]);

  // Auto-expand sections when searching
  useEffect(() => {
    if (search) {
      setExpandedSections(new Set(grouped.map(([key]) => key)));
    }
  }, [search, grouped]);

  function selectTable(id: string) {
    setSelectedId(id);
    setTab('data');
    setCompareId(null);
    setSidebarOpen(false); // close sidebar on mobile after selection
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // --- Sidebar ---
  function renderSidebar() {
    return (
      <>
        <div class="p-3 border-b bg-white">
          <label for="explorer-search" class="sr-only">Search tables</label>
          <input
            id="explorer-search"
            type="text"
            placeholder="Search tables..."
            class="w-full px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          />
          <div class="flex gap-1 mt-2">
            {(['', 'operating', 'capital'] as const).map((bt) => (
              <button
                key={bt || 'all'}
                class={`px-2 py-1.5 rounded text-xs font-medium transition flex-1 ${
                  budgetFilter === bt ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
                onClick={() => { setBudgetFilter(bt); setTypeFilter(''); }}
              >
                {bt === '' ? `All (${tablesIndex.length})` : bt === 'operating' ? `Operating (${budgetCounts.operating})` : `Capital (${budgetCounts.capital})`}
              </button>
            ))}
          </div>
          <div class="flex flex-wrap gap-1 mt-2">
            <button
              class={`px-2 py-1.5 rounded text-xs font-medium transition ${
                !typeFilter ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
              onClick={() => setTypeFilter('')}
            >
              All
            </button>
            {[...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <button
                key={type}
                class={`px-2 py-1.5 rounded text-xs font-medium transition ${
                  typeFilter === type
                    ? 'bg-blue-600 text-white'
                    : `${TYPE_COLORS[type] || TYPE_COLORS.unknown} hover:opacity-80`
                }`}
                onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              >
                {typeLabel(type)} ({count})
              </button>
            ))}
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          {grouped.length === 0 && (
            <div class="p-4 text-sm text-gray-400 italic">No tables match your filters.</div>
          )}
          {grouped.map(([key, { title, budgetType, tables }]) => (
            <div key={key} class="border-b">
              <button
                class="w-full px-3 py-2 text-left text-sm font-medium hover:bg-gray-100 flex items-center gap-2"
                onClick={() => toggleSection(key)}
              >
                <span class="text-gray-400 text-xs" aria-hidden="true">{expandedSections.has(key) ? '▼' : '▶'}</span>
                {!budgetFilter && (
                  <span class={`px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 ${
                    budgetType === 'capital' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                  }`}>{budgetType === 'capital' ? 'CAP' : 'OP'}</span>
                )}
                <span class="truncate flex-1">{title}</span>
                <span class="text-xs text-gray-400">{tables.length}</span>
              </button>
              {expandedSections.has(key) && (
                <div class="pb-1">
                  {tables.map((t) => (
                    <button
                      key={t.id}
                      class={`w-full px-3 py-1.5 pl-8 text-left text-xs hover:bg-blue-50 flex items-center gap-2 ${
                        selectedId === t.id ? 'bg-blue-100 text-blue-800' : 'text-gray-600'
                      }`}
                      onClick={() => selectTable(t.id)}
                    >
                      <span class={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[t.type] || TYPE_COLORS.unknown}`}>
                        {typeLabel(t.type)}
                      </span>
                      <span class="truncate" title={t.label || `P${t.page}T${t.tableIndex}`}>
                        {t.label || `P${t.page}T${t.tableIndex}`}
                      </span>
                      <span class="text-gray-400 ml-auto" title={`${t.rowCount} rows`}>{t.rowCount} rows</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div class="p-2 border-t bg-white text-xs text-gray-400 text-center">
          {filtered.length} of {tablesIndex.length} tables
        </div>
      </>
    );
  }

  // --- Data Tab ---
  function renderDataTab() {
    if (!selectedFull) return null;
    const { table } = selectedFull;
    const filename = `${selectedMeta!.sectionSlug}_P${selectedMeta!.page}T${selectedMeta!.tableIndex}.csv`;

    return (
      <div>
        <div class="flex gap-2 mb-4">
          <button
            class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
            onClick={() => downloadCsv(table.headers, table.rows, filename)}
          >
            Download CSV
          </button>
          <button
            class="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
        {renderTable(table, selectedMeta?.numericCols)}
      </div>
    );
  }

  function renderTable(table: Table, numericCols?: number[]) {
    const sections = table.sections || [];
    const colCount = table.headers.length;
    const numSet = new Set(numericCols || []);

    function isTotalRow(row: string[]): boolean {
      const cell = (row[0] || '').trim().toLowerCase();
      return cell.startsWith('total') || cell.endsWith('total');
    }

    return (
      <div class="overflow-x-auto border rounded-lg print:border-none">
        <table class="w-full text-sm">
          {table.headers.length > 0 && (
            <thead>
              <tr class="bg-gray-50">
                {table.headers.map((h, i) => (
                  <th key={i} class={`px-3 py-2 font-medium text-gray-700 border-b whitespace-nowrap ${numSet.has(i) ? 'text-right tabular-nums' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {table.rows.map((row, i) => {
              const section = sections[i] || '';
              const prevSection = i > 0 ? (sections[i - 1] || '') : '';
              const showDivider = section !== '' && section !== prevSection;
              const isSectionRow = showDivider && row[0]?.trim() === section;
              const isTotal = isTotalRow(row);

              return (
                <>
                  {showDivider && !isSectionRow && (
                    <tr key={`sec-${i}`} class="bg-amber-50 border-t-2 border-amber-200">
                      <td colSpan={colCount} class="px-3 py-1.5 text-xs font-semibold text-amber-800 uppercase tracking-wide">
                        {section}
                      </td>
                    </tr>
                  )}
                  <tr key={i} class={
                    isSectionRow
                      ? 'bg-amber-50 border-t-2 border-amber-200 font-semibold text-amber-900'
                      : isTotal
                        ? 'bg-gray-100 border-t-2 border-gray-300 font-semibold text-gray-900'
                        : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }>
                    {row.map((cell, j) => (
                      <td key={j} class={`px-3 py-1.5 border-b border-gray-100 whitespace-nowrap ${numSet.has(j) ? 'text-right tabular-nums' : ''}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Detect year columns for trend/changes tabs
  const yearColCount = useMemo(() => {
    if (!selectedMeta) return 0;
    return selectedMeta.numericCols.filter((i) =>
      selectedMeta.headers[i]?.match(/\b20\d{2}\b/)
    ).length;
  }, [selectedMeta]);

  // --- Chart Tab ---
  function renderChartTab() {
    if (!selectedFull || !selectedMeta) return null;
    if (selectedMeta.numericCols.length === 0) {
      return <div class="text-gray-400 italic py-4">No numeric columns detected in this table.</div>;
    }
    return (
      <ChartPanel
        table={selectedFull.table}
        numericCols={selectedMeta.numericCols}
        chartCol={chartCol}
        onChartColChange={setChartCol}
        tableId={selectedId!}
      />
    );
  }

  // --- Trend Tab ---
  function renderTrendTab() {
    if (!selectedFull || !selectedMeta) return null;
    return (
      <TrendChart
        headers={selectedFull.table.headers}
        rows={selectedFull.table.rows}
        numericCols={selectedMeta.numericCols}
        tableId={selectedId!}
      />
    );
  }

  // --- Changes Tab ---
  function renderChangesTab() {
    if (!selectedFull || !selectedMeta) return null;
    return (
      <YearChangeChart
        headers={selectedFull.table.headers}
        rows={selectedFull.table.rows}
        numericCols={selectedMeta.numericCols}
        tableId={selectedId!}
      />
    );
  }

  // --- Compare Tab ---
  function renderCompareTab() {
    if (!selectedFull || !selectedMeta) return null;

    // Filter to tables of same type for meaningful comparison
    const candidates = tablesIndex.filter(
      (t) => t.id !== selectedId && t.type === selectedMeta.type
    );

    return (
      <div>
        <div class="flex items-center gap-3 mb-4">
          <label class="text-sm font-medium text-gray-700">Compare with:</label>
          <select
            class="border rounded px-2 py-1 text-sm max-w-md"
            value={compareId || ''}
            onChange={(e) => setCompareId((e.target as HTMLSelectElement).value || null)}
          >
            <option value="">Select a table...</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.sectionTitle} — P{t.page}T{t.tableIndex} ({t.rowCount} rows)
              </option>
            ))}
          </select>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div>
            <h3 class="text-sm font-semibold text-gray-600 mb-2">{selectedMeta.sectionTitle}</h3>
            {renderTable(selectedFull.table, selectedMeta.numericCols)}
          </div>
          {compareFull && (
            <div>
              <h3 class="text-sm font-semibold text-gray-600 mb-2">
                {compareFull.sectionTitle}
              </h3>
              {renderTable(compareFull.table)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div class="flex print:block" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Mobile sidebar toggle */}
      <button
        class="md:hidden fixed bottom-4 left-4 z-40 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg text-sm font-medium"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? 'Close' : 'Filter'}
      </button>

      {/* Sidebar — hidden on mobile unless toggled */}
      <div class={`
        print:hidden
        w-72 lg:w-80 border-r bg-gray-50 flex flex-col overflow-hidden shrink-0
        fixed md:static inset-0 z-30
        transition-transform md:transition-none md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {renderSidebar()}
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          class="md:hidden fixed inset-0 bg-black/30 z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div class="flex-1 overflow-y-auto p-6">
        {!selectedFull ? (
          <div class="flex flex-col items-center justify-center h-full text-center">
            <div class="text-5xl mb-4 text-gray-300" aria-hidden="true">
              <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M3 14h18M3 6h18M3 18h18" />
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-500 mb-2">Select a table</h2>
            <p class="text-gray-400 max-w-md">
              Browse {tablesIndex.length} tables across operating and capital budgets.
              Use the search and type filters to find what you need, then click a table to view, chart, compare, or export.
            </p>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div class="mb-4 print:mb-2">
              <h2 class="text-xl font-bold">{selectedMeta!.sectionTitle}</h2>
              <div class="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <span class={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[selectedMeta!.type] || TYPE_COLORS.unknown}`}>
                  {typeLabel(selectedMeta!.type)}
                </span>
                {selectedMeta!.label && (
                  <span class="font-medium text-gray-700">{selectedMeta!.label}</span>
                )}
                <span>Page {selectedMeta!.page + 1}, Table {selectedMeta!.tableIndex + 1}</span>
                <span>&middot; {selectedMeta!.rowCount} rows, {selectedMeta!.headers.length} columns</span>
                {selectedFull && (
                  <PageImage slug={selectedFull.slug} page={selectedMeta!.page} />
                )}
              </div>
            </div>

            {/* Tabs */}
            <div class="flex gap-1 border-b mb-4 print:hidden" role="tablist">
              {(['data', 'chart', ...(selectedMeta?.type === 'cip_funding' ? ['funding'] : []), ...(yearColCount >= 3 ? ['trend'] : []), ...(yearColCount >= 2 ? ['changes'] : []), 'compare'] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  class={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                    tab === t
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'data' && renderDataTab()}
            {tab === 'chart' && renderChartTab()}
            {tab === 'funding' && selectedFull && (
              <FundingStackedBar
                headers={selectedFull.table.headers}
                rows={selectedFull.table.rows}
                tableId={selectedId!}
              />
            )}
            {tab === 'trend' && renderTrendTab()}
            {tab === 'changes' && renderChangesTab()}
            {tab === 'compare' && renderCompareTab()}
          </div>
        )}
      </div>
    </div>
  );
}
