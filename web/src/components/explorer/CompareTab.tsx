/**Compare tab: side-by-side table comparison with a searchable modal picker.*/

import { useState, useMemo, useEffect } from 'preact/hooks';
import TableView from './TableView';
import { TYPE_COLORS, typeLabel } from '../../lib/type-colors';

interface Table {
  headers: string[];
  rows: string[][];
  sections?: string[];
}

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

interface Props {
  currentTable: Table;
  currentMeta: TableIndex;
  compareTable: { table: Table; sectionTitle: string } | null;
  candidates: TableIndex[];
  compareId: string | null;
  onCompareIdChange: (id: string | null) => void;
}

function TablePicker({ candidates, onSelect, onClose }: {
  candidates: TableIndex[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return candidates;
    const q = query.toLowerCase();
    return candidates.filter(
      (t) =>
        t.sectionTitle.toLowerCase().includes(q) ||
        (t.label || '').toLowerCase().includes(q) ||
        t.headers.some((h) => h.toLowerCase().includes(q))
    );
  }, [candidates, query]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="p-3 border-b">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-semibold text-sm text-gray-700">Select a table to compare</h3>
            <button class="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={onClose} aria-label="Close">&times;</button>
          </div>
          <input
            type="text"
            placeholder="Search by section, label or column name..."
            class="w-full px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-ps-blue-400"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            autoFocus
          />
        </div>
        <div class="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div class="p-4 text-sm text-gray-400 italic text-center">No matching tables.</div>
          )}
          {filtered.map((t) => (
            <button
              key={t.id}
              class="w-full px-3 py-2 text-left text-sm hover:bg-ps-blue-50 flex items-center gap-2 border-b border-gray-50"
              onClick={() => { onSelect(t.id); }}
            >
              <span class={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${TYPE_COLORS[t.type] || TYPE_COLORS.unknown}`}>
                {typeLabel(t.type)}
              </span>
              <div class="flex-1 min-w-0">
                <div class="truncate font-medium text-gray-700">{t.sectionTitle}</div>
                <div class="text-xs text-gray-400 truncate">
                  {t.label || `P${t.page}T${t.tableIndex}`} &middot; {t.rowCount} rows
                </div>
              </div>
            </button>
          ))}
        </div>
        <div class="p-2 border-t text-xs text-gray-400 text-center">
          {filtered.length} of {candidates.length} same-type tables
        </div>
      </div>
    </div>
  );
}

export default function CompareTab({ currentTable, currentMeta, compareTable, candidates, compareId, onCompareIdChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div>
      <div class="flex items-center gap-3 mb-4">
        {compareId && compareTable ? (
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500">Comparing with:</span>
            <span class="text-sm font-medium text-gray-700">{compareTable.sectionTitle}</span>
            <button
              class="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100"
              onClick={() => onCompareIdChange(null)}
            >
              &times; Clear
            </button>
            <button
              class="text-xs text-ps-blue-600 hover:text-ps-blue-800 px-1.5 py-0.5 rounded hover:bg-ps-blue-50"
              onClick={() => setPickerOpen(true)}
            >
              Change
            </button>
          </div>
        ) : (
          <button
            class="px-3 py-1.5 bg-ps-blue-600 text-white text-sm rounded hover:bg-ps-blue-700 transition"
            onClick={() => setPickerOpen(true)}
          >
            Choose a table to compare...
          </button>
        )}
      </div>

      {pickerOpen && (
        <TablePicker
          candidates={candidates}
          onSelect={(id) => { onCompareIdChange(id); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div>
          <h3 class="text-sm font-semibold text-gray-600 mb-2">{currentMeta.sectionTitle}</h3>
          <TableView
            headers={currentTable.headers}
            rows={currentTable.rows}
            sections={currentTable.sections}
            numericCols={currentMeta.numericCols}
          />
        </div>
        {compareTable && (
          <div>
            <h3 class="text-sm font-semibold text-gray-600 mb-2">
              {compareTable.sectionTitle}
            </h3>
            <TableView
              headers={compareTable.table.headers}
              rows={compareTable.table.rows}
              sections={compareTable.table.sections}
            />
          </div>
        )}
      </div>
    </div>
  );
}
