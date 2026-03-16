/**Interactive data explorer shell — manages state and layout, delegates rendering to sub-components.*/

import { useState, useMemo, useEffect } from 'preact/hooks';
import ExplorerSidebar from './ExplorerSidebar';
import DataTab from './DataTab';
import VizTab from './VizTab';
import CompareTab from './CompareTab';
import EmptyState from './EmptyState';
import PageImage from '../PageImage';
import { TYPE_COLORS, typeLabel } from '../../lib/type-colors';

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

type Tab = 'data' | 'visualize' | 'compare';

const TAB_LABELS: Record<Tab, string> = {
  data: 'Table Data',
  visualize: 'Visualize',
  compare: 'Compare',
};

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

  // Group filtered tables by section
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
    return [...map.entries()].sort((a, b) => {
      const aType = a[1].budgetType;
      const bType = b[1].budgetType;
      if (aType !== bType) return aType === 'operating' ? -1 : 1;
      const aNum = parseInt(a[0].split(':')[1]);
      const bNum = parseInt(b[0].split(':')[1]);
      return aNum - bNum;
    });
  }, [filtered]);

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

  // Auto-expand sections when searching or when few sections visible
  useEffect(() => {
    if (search || grouped.length <= 5) {
      setExpandedSections(new Set(grouped.map(([key]) => key)));
    }
  }, [search, grouped]);

  function selectTable(id: string): void {
    setSelectedId(id);
    setTab('data');
    setCompareId(null);
    setSidebarOpen(false);
  }

  function toggleSection(key: string): void {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleBudgetFilterChange(value: '' | 'operating' | 'capital'): void {
    setBudgetFilter(value);
    setTypeFilter('');
  }

  // Whether the Visualize tab should be available
  const hasViz = selectedMeta ? selectedMeta.numericCols.length > 0 || selectedMeta.type === 'cip_funding' : false;

  // Available tabs
  const availableTabs = useMemo((): Tab[] => {
    const tabs: Tab[] = ['data'];
    if (hasViz) tabs.push('visualize');
    tabs.push('compare');
    return tabs;
  }, [hasViz]);

  // Compare candidates
  const compareCandidates = useMemo(() => {
    if (!selectedMeta) return [];
    return tablesIndex.filter((t) => t.id !== selectedId && t.type === selectedMeta.type);
  }, [tablesIndex, selectedId, selectedMeta]);

  return (
    <div class="flex print:block" style={{ height: 'calc(100vh - 7rem)' }}>
      {/* Mobile sidebar toggle */}
      <button
        class="md:hidden fixed bottom-4 left-4 z-40 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg text-sm font-medium"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? 'Close' : 'Filter'}
      </button>

      {/* Sidebar */}
      <div class={`
        print:hidden
        w-72 lg:w-80 border-r bg-gray-50 flex flex-col overflow-hidden shrink-0
        fixed md:static inset-0 z-30
        transition-transform md:transition-none md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <ExplorerSidebar
          search={search}
          onSearchChange={setSearch}
          budgetFilter={budgetFilter}
          onBudgetFilterChange={handleBudgetFilterChange}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          typeCounts={typeCounts}
          grouped={grouped}
          expandedSections={expandedSections}
          onToggleSection={toggleSection}
          selectedId={selectedId}
          onSelectTable={selectTable}
          totalCount={tablesIndex.length}
          filteredCount={filtered.length}
        />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          class="md:hidden fixed inset-0 bg-black/30 z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div class="flex-1 overflow-y-auto p-6">
        {!selectedFull ? (
          <EmptyState
            tablesIndex={tablesIndex}
            totalCount={tablesIndex.length}
            onSelectTable={selectTable}
          />
        ) : (
          <div>
            {/* Header */}
            <div class="mb-4 print:mb-2">
              <h2 class="text-xl font-bold">
                <a
                  href={`/${(selectedMeta!.budgetType || 'operating') === 'capital' ? 'capital' : 'sections'}/${selectedMeta!.sectionSlug}/`}
                  class="hover:text-blue-600 hover:underline"
                >
                  {selectedMeta!.sectionTitle}
                </a>
              </h2>
              <div class="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <span class={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[selectedMeta!.type] || TYPE_COLORS.unknown}`}>
                  {typeLabel(selectedMeta!.type)}
                </span>
                {selectedMeta!.label && (
                  <span class="font-medium text-gray-700">{selectedMeta!.label}</span>
                )}
                <span>Page {selectedMeta!.page + 1}, Table {selectedMeta!.tableIndex + 1}</span>
                <span>&middot; {selectedMeta!.rowCount} rows, {selectedMeta!.headers.length} columns</span>
                <PageImage slug={selectedFull.slug} page={selectedMeta!.page} />
                <a
                  href={`/${(selectedMeta!.budgetType || 'operating') === 'capital' ? 'capital' : 'sections'}/${selectedMeta!.sectionSlug}/`}
                  class="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7l2 2h5a2 2 0 012 2v12a2 2 0 01-2 2z" />
                  </svg>
                  Full section
                </a>
              </div>
            </div>

            {/* Tabs */}
            <div class="flex gap-1 border-b mb-4 print:hidden" role="tablist">
              {availableTabs.map((t) => (
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
            {tab === 'data' && (
              <DataTab
                table={selectedFull.table}
                numericCols={selectedMeta!.numericCols}
                filename={`${selectedMeta!.sectionSlug}_P${selectedMeta!.page}T${selectedMeta!.tableIndex}.csv`}
              />
            )}
            {tab === 'visualize' && (
              <VizTab
                headers={selectedFull.table.headers}
                rows={selectedFull.table.rows}
                numericCols={selectedMeta!.numericCols}
                tableId={selectedId!}
                tableType={selectedMeta!.type}
                chartCol={chartCol}
                onChartColChange={setChartCol}
              />
            )}
            {tab === 'compare' && (
              <CompareTab
                currentTable={selectedFull.table}
                currentMeta={selectedMeta!}
                compareTable={compareFull ? { table: compareFull.table, sectionTitle: compareFull.sectionTitle } : null}
                candidates={compareCandidates}
                compareId={compareId}
                onCompareIdChange={setCompareId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
