/**Filterable, sortable view of personnel tables across all departments.*/

import { useState, useMemo } from 'preact/hooks';

interface Section {
  section_number: number;
  title: string;
  slug: string;
  tables: {
    table_type: string;
    headers: string[];
    rows: string[][];
  }[];
}

interface PersonnelRow {
  department: string;
  slug: string;
  title: string;
  fte2025: number | null;
  fte2026: number | null;
  budget2025: number | null;
  budget2026: number | null;
  rateGrade: string;
}

function parseCurrency(s: string): number | null {
  if (!s || s === '—' || s === 'varies') return null;
  const cleaned = s.replace(/[$,()]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractPersonnel(sections: Section[]): PersonnelRow[] {
  const rows: PersonnelRow[] = [];

  for (const section of sections) {
    for (const table of section.tables) {
      if (table.table_type !== 'personnel') continue;

      const headers = table.headers.map((h) => h.toLowerCase());

      // Find column indices
      const titleIdx = headers.findIndex((h) => h.includes('title'));
      const fte2025Idx = headers.findIndex((h) => h.includes('2025') && h.includes('fte'));
      const fte2026Idx = headers.findIndex((h) => h.includes('2026') && h.includes('fte'));
      const budget2025Idx = headers.findIndex((h) => h.includes('2025') && h.includes('budget'));
      const budget2026Idx = headers.findIndex((h) => h.includes('2026') && h.includes('budget'));
      const rateIdx = headers.findIndex((h) => h.includes('rate') || h.includes('grade'));

      if (titleIdx < 0) continue;

      for (const row of table.rows) {
        const title = row[titleIdx] || '';
        if (!title || title.toLowerCase().includes('total')) continue;

        rows.push({
          department: section.title,
          slug: section.slug,
          title,
          fte2025: fte2025Idx >= 0 ? parseCurrency(row[fte2025Idx]) : null,
          fte2026: fte2026Idx >= 0 ? parseCurrency(row[fte2026Idx]) : null,
          budget2025: budget2025Idx >= 0 ? parseCurrency(row[budget2025Idx]) : null,
          budget2026: budget2026Idx >= 0 ? parseCurrency(row[budget2026Idx]) : null,
          rateGrade: rateIdx >= 0 ? (row[rateIdx] || '') : '',
        });
      }
    }
  }

  return rows;
}

type SortKey = 'title' | 'department' | 'fte2026' | 'budget2026';

function formatCurrency(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toLocaleString()}`;
}

export default function PersonnelExplorer({ sections }: { sections: Section[] }) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('department');
  const [sortAsc, setSortAsc] = useState(true);

  const allRows = useMemo(() => extractPersonnel(sections), [sections]);
  const departments = useMemo(
    () => [...new Set(allRows.map((r) => r.department))].sort(),
    [allRows],
  );

  const filtered = useMemo(() => {
    let rows = allRows;
    if (deptFilter) rows = rows.filter((r) => r.department === deptFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) => r.title.toLowerCase().includes(q) || r.department.toLowerCase().includes(q),
      );
    }
    rows = [...rows].sort((a, b) => {
      let av: string | number | null, bv: string | number | null;
      if (sortKey === 'title') { av = a.title; bv = b.title; }
      else if (sortKey === 'department') { av = a.department; bv = b.department; }
      else if (sortKey === 'fte2026') { av = a.fte2026; bv = b.fte2026; }
      else { av = a.budget2026; bv = b.budget2026; }
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [allRows, search, deptFilter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return ' ↕';
    return sortAsc ? ' ↑' : ' ↓';
  };

  return (
    <div>
      <div class="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Filter by title..."
          class="px-3 py-1.5 border rounded text-sm flex-1 min-w-[200px]"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />
        <select
          class="border rounded px-2 py-1.5 text-sm"
          value={deptFilter}
          onChange={(e) => setDeptFilter((e.target as HTMLSelectElement).value)}
        >
          <option value="">All departments ({departments.length})</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div class="text-sm text-gray-500 mb-2">{filtered.length} positions</div>

      <div class="overflow-x-auto border rounded-lg">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50">
              <th
                class="px-3 py-2 text-left font-medium cursor-pointer hover:text-blue-600"
                onClick={() => toggleSort('title')}
              >
                Title{sortIcon('title')}
              </th>
              <th
                class="px-3 py-2 text-left font-medium cursor-pointer hover:text-blue-600"
                onClick={() => toggleSort('department')}
              >
                Department{sortIcon('department')}
              </th>
              <th class="px-3 py-2 text-right font-medium">Rate/Grade</th>
              <th
                class="px-3 py-2 text-right font-medium cursor-pointer hover:text-blue-600"
                onClick={() => toggleSort('fte2026')}
              >
                FTE 2026{sortIcon('fte2026')}
              </th>
              <th
                class="px-3 py-2 text-right font-medium cursor-pointer hover:text-blue-600"
                onClick={() => toggleSort('budget2026')}
              >
                2026 Budget{sortIcon('budget2026')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((row, i) => (
              <tr key={i} class={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td class="px-3 py-1.5 border-t">{row.title}</td>
                <td class="px-3 py-1.5 border-t">
                  <a href={`/sections/${row.slug}/`} class="text-blue-600 hover:underline">
                    {row.department}
                  </a>
                </td>
                <td class="px-3 py-1.5 border-t text-right">{row.rateGrade || '—'}</td>
                <td class="px-3 py-1.5 border-t text-right">{row.fte2026 ?? '—'}</td>
                <td class="px-3 py-1.5 border-t text-right">{formatCurrency(row.budget2026)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <div class="px-3 py-2 text-sm text-gray-500 bg-gray-50 border-t">
            Showing first 100 of {filtered.length} results. Use filters to narrow down.
          </div>
        )}
      </div>
    </div>
  );
}
