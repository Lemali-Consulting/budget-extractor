/**Sidebar panel with search, budget/type filters, and expandable section accordion.*/

import { useState } from 'preact/hooks';
import { TYPE_COLORS, typeLabel } from '../../lib/type-colors';
import { sectionPage } from '../../lib/published-pages';

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

interface GroupedSection {
  title: string;
  slug: string;
  budgetType: string;
  tables: TableIndex[];
}

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  budgetFilter: '' | 'operating' | 'capital';
  onBudgetFilterChange: (value: '' | 'operating' | 'capital') => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  typeCounts: Map<string, number>;
  grouped: [string, GroupedSection][];
  expandedSections: Set<string>;
  onToggleSection: (key: string) => void;
  selectedId: string | null;
  onSelectTable: (id: string) => void;
  totalCount: number;
  filteredCount: number;
  /** Published page per operating section slug (see publishedSectionHrefs); a section without one isn't linked. */
  sectionHrefs: Record<string, string>;
}

export default function ExplorerSidebar({
  search,
  onSearchChange,
  budgetFilter,
  onBudgetFilterChange,
  typeFilter,
  onTypeFilterChange,
  typeCounts,
  grouped,
  expandedSections,
  onToggleSection,
  selectedId,
  onSelectTable,
  totalCount,
  filteredCount,
  sectionHrefs,
}: Props) {
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);

  return (
    <>
      <div class="p-3 border-b bg-white">
        <label for="explorer-search" class="sr-only">Search tables</label>
        <input
          id="explorer-search"
          type="text"
          placeholder="Search tables..."
          class="w-full px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ps-blue-400"
          value={search}
          onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        />
        <div class="flex gap-0.5 mt-2 bg-gray-100 rounded p-0.5">
          {(['', 'operating', 'capital'] as const).map((bt) => (
            <button
              key={bt || 'all'}
              class={`px-2 py-1 rounded text-xs font-medium transition flex-1 ${
                budgetFilter === bt ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => onBudgetFilterChange(bt)}
            >
              {bt === '' ? 'All' : bt === 'operating' ? 'Operating' : 'Capital'}
            </button>
          ))}
        </div>

        {/* Type filter: active chip or disclosure toggle */}
        {typeFilter ? (
          <div class="mt-2 flex items-center gap-1">
            <span class={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${TYPE_COLORS[typeFilter] || TYPE_COLORS.unknown}`}>
              {typeLabel(typeFilter)}
              <button
                class="ml-0.5 hover:opacity-70"
                onClick={() => onTypeFilterChange('')}
                aria-label={`Clear ${typeLabel(typeFilter)} filter`}
              >
                &times;
              </button>
            </span>
          </div>
        ) : (
          <button
            class="mt-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            onClick={() => setTypeFilterOpen(!typeFilterOpen)}
          >
            <span class="text-[10px]" aria-hidden="true">{typeFilterOpen ? '▼' : '▶'}</span>
            Filter by type
          </button>
        )}
        {typeFilterOpen && !typeFilter && (
          <div class="flex flex-wrap gap-1 mt-1.5">
            {[...typeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <button
                key={type}
                class={`px-2 py-1 rounded text-xs font-medium transition ${TYPE_COLORS[type] || TYPE_COLORS.unknown} hover:opacity-80`}
                onClick={() => { onTypeFilterChange(type); setTypeFilterOpen(false); }}
              >
                {typeLabel(type)} ({count})
              </button>
            ))}
          </div>
        )}
      </div>

      <div class="flex-1 overflow-y-auto">
        {grouped.length === 0 && (
          <div class="p-4 text-sm text-gray-400 italic">No tables match your filters.</div>
        )}
        {grouped.map(([key, { title, slug, budgetType, tables }]) => (
          <div key={key} class="border-b">
            <div class="flex items-center hover:bg-gray-100">
              <button
                class="flex-1 px-3 py-2 text-left text-sm font-medium flex items-center gap-2 min-w-0"
                onClick={() => onToggleSection(key)}
              >
                <span class="text-gray-400 text-xs" aria-hidden="true">{expandedSections.has(key) ? '▼' : '▶'}</span>
                {!budgetFilter && (
                  <span class={`px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 ${
                    budgetType === 'capital' ? 'bg-orange-100 text-orange-600' : 'bg-ps-blue-100 text-ps-blue-600'
                  }`}>{budgetType === 'capital' ? 'CAP' : 'OP'}</span>
                )}
                <span class="truncate flex-1">{title}</span>
                <span class="text-xs text-gray-400">{tables.length}</span>
              </button>
              {sectionPage({ sectionHrefs, budgetType, slug }) && <a
                href={sectionPage({ sectionHrefs, budgetType, slug })}
                class="px-2 py-1 text-gray-400 hover:text-ps-blue-600 shrink-0"
                title={`View ${title} detail page`}
                aria-label={`View ${title} detail page`}
                onClick={(e) => e.stopPropagation()}
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>}
            </div>
            {expandedSections.has(key) && (
              <div class="pb-1">
                {tables.map((t) => (
                  <button
                    key={t.id}
                    class={`w-full px-3 py-1.5 pl-8 text-left text-xs hover:bg-ps-blue-50 flex items-center gap-2 ${
                      selectedId === t.id ? 'bg-ps-blue-100 text-ps-blue-800' : 'text-gray-600'
                    }`}
                    onClick={() => onSelectTable(t.id)}
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
        {filteredCount} of {totalCount} tables
      </div>
    </>
  );
}
