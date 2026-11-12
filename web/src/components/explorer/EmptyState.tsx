/**Curated empty state with suggested starting tables for first-time visitors.*/

import { TYPE_COLORS, typeLabel, typeDescription } from '../../lib/type-colors';

interface TableIndex {
  id: string;
  sectionTitle: string;
  type: string;
  rowCount: number;
}

interface Props {
  tablesIndex: TableIndex[];
  totalCount: number;
  onSelectTable: (id: string) => void;
}

const SUGGESTED_IDS = [
  { id: 's5_p1_t1', fallbackTitle: 'Revenue Summary' },
  { id: 's8_p1_t0', fallbackTitle: 'Expenditure Summary' },
  { id: 's26_p7_t0', fallbackTitle: 'Bureau of Police' },
  { id: 'cap_s28_p0_t0', fallbackTitle: 'Street Resurfacing' },
  { id: 's26_p5_t0', fallbackTitle: 'Bureau of Police Personnel' },
];

export default function EmptyState({ tablesIndex, totalCount, onSelectTable }: Props) {
  const indexMap = new Map(tablesIndex.map((t) => [t.id, t]));
  const suggestions = SUGGESTED_IDS
    .map((s) => indexMap.get(s.id))
    .filter((t): t is TableIndex => t !== undefined);

  return (
    <div class="flex flex-col items-center justify-center h-full text-center">
      <svg class="w-10 h-10 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 10h18M3 14h18M3 6h18M3 18h18" />
      </svg>
      <h2 class="text-xl font-semibold text-gray-600 mb-1">Start exploring</h2>
      <p class="text-gray-400 text-sm mb-6 max-w-sm">
        {totalCount} tables across operating and capital budgets. Pick one below or use the sidebar to search and filter.
      </p>

      {suggestions.length > 0 && (
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
          {suggestions.map((t) => (
            <button
              key={t.id}
              class="text-left p-3 rounded-lg border border-gray-200 hover:border-ps-blue-300 hover:bg-ps-blue-50 transition group"
              onClick={() => onSelectTable(t.id)}
            >
              <div class="flex items-center gap-2 mb-1">
                <span class={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[t.type] || TYPE_COLORS.unknown}`}>
                  {typeLabel(t.type)}
                </span>
                <span class="text-xs text-gray-400">{t.rowCount} rows</span>
              </div>
              <div class="text-sm font-medium text-gray-700 group-hover:text-ps-blue-700 truncate">
                {t.sectionTitle}
              </div>
              <div class="text-xs text-gray-400 mt-0.5">
                {typeDescription(t.type)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
