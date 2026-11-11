/**Filterable, sortable view of personnel tables across all departments.*/

import { useState, useMemo } from 'preact/hooks';
import GlossaryTip from './GlossaryTip';
import { FTE_TOOLTIP } from '../lib/glossary-terms';

interface PersonnelRow {
  department: string;
  slug: string;
  title: string;
  ftePrior: number | null;
  fteCurrent: number | null;
  budgetPrior: number | null;
  budgetCurrent: number | null;
  rateGrade: string;
}

type SortKey = 'title' | 'department' | 'fteCurrent' | 'budgetCurrent';

interface Props {
  rows: PersonnelRow[];
  /** Budget year the rows describe; labels the FTE and budget columns. */
  year: number;
  /** Route prefix of that year's pages ("" headline, "/2026" archive). */
  routePrefix: string;
}

function formatCurrency(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toLocaleString()}`;
}

export default function PersonnelExplorer({ rows, year, routePrefix }: Props) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('department');
  const [sortAsc, setSortAsc] = useState(true);

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let result = rows;
    if (deptFilter) result = result.filter((r) => r.department === deptFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.title.toLowerCase().includes(q) || r.department.toLowerCase().includes(q),
      );
    }
    result = [...result].sort((a, b) => {
      let av: string | number | null, bv: string | number | null;
      if (sortKey === 'title') { av = a.title; bv = b.title; }
      else if (sortKey === 'department') { av = a.department; bv = b.department; }
      else if (sortKey === 'fteCurrent') { av = a.fteCurrent; bv = b.fteCurrent; }
      else { av = a.budgetCurrent; bv = b.budgetCurrent; }
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [rows, search, deptFilter, sortKey, sortAsc]);

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
          class="border rounded px-2 py-1 text-sm"
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
                class="px-3 py-2 text-left font-medium cursor-pointer hover:text-ps-blue-600"
                onClick={() => toggleSort('title')}
              >
                Title{sortIcon('title')}
              </th>
              <th
                class="px-3 py-2 text-left font-medium cursor-pointer hover:text-ps-blue-600"
                onClick={() => toggleSort('department')}
              >
                Department{sortIcon('department')}
              </th>
              <th class="px-3 py-2 text-right font-medium">Rate/Grade</th>
              <th
                class="px-3 py-2 text-right font-medium cursor-pointer hover:text-ps-blue-600"
                onClick={() => toggleSort('fteCurrent')}
              >
                <GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} /> {year}{sortIcon('fteCurrent')}
              </th>
              <th
                class="px-3 py-2 text-right font-medium cursor-pointer hover:text-ps-blue-600"
                onClick={() => toggleSort('budgetCurrent')}
              >
                {year} budget{sortIcon('budgetCurrent')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((row, i) => (
              <tr key={i} class={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td class="px-3 py-1.5 border-t">{row.title}</td>
                <td class="px-3 py-1.5 border-t">
                  <a href={`${routePrefix}/sections/${row.slug}/`} class="text-ps-blue-600 hover:underline">
                    {row.department}
                  </a>
                </td>
                <td class="px-3 py-1.5 border-t text-right">
                  {row.rateGrade === 'see below' ? (
                    <a
                      href={`${routePrefix}/sections/salary-tables/`}
                      class="text-ps-blue-600 hover:underline text-xs"
                      title="Rate set by collective bargaining agreement — see Salary Tables"
                    >
                      CBA rates
                    </a>
                  ) : (
                    row.rateGrade || '—'
                  )}
                </td>
                <td class="px-3 py-1.5 border-t text-right">{row.fteCurrent ?? '—'}</td>
                <td class="px-3 py-1.5 border-t text-right">{formatCurrency(row.budgetCurrent)}</td>
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
