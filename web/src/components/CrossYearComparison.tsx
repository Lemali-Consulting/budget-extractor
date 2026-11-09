/**Cross-year budget comparison: 2025 proposed vs 2025 adopted (as reported in 2026 doc).*/
import { useState, useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { useContainerWidth } from '../lib/hooks';

interface DeptBudget {
  department: string;
  slug: string;
  year: string;
  amount: number;
}

interface ComparisonRow {
  department: string;
  slug: string;
  proposed: number;
  adopted: number;
  difference: number;
  pctChange: number;
}

interface Props {
  proposed: DeptBudget[];  // from 2025 document
  adopted: DeptBudget[];   // from 2026 document
  /** Route prefix of the archive year the links point into (e.g. "/2026"). */
  routePrefix: string;
}

function formatDollar(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function buildComparison(proposed: DeptBudget[], adopted: DeptBudget[]): ComparisonRow[] {
  // Build lookup: dept -> amount for "2025 Budget" column in each doc
  const proposedMap = new Map<string, { amount: number; slug: string }>();
  const adoptedMap = new Map<string, { amount: number; slug: string }>();

  for (const row of proposed) {
    if (row.year === '2025 Budget') {
      proposedMap.set(row.department, { amount: row.amount, slug: row.slug });
    }
  }
  for (const row of adopted) {
    if (row.year === '2025 Budget') {
      adoptedMap.set(row.department, { amount: row.amount, slug: row.slug });
    }
  }

  const rows: ComparisonRow[] = [];
  const allDepts = new Set([...proposedMap.keys(), ...adoptedMap.keys()]);

  for (const dept of allDepts) {
    const p = proposedMap.get(dept);
    const a = adoptedMap.get(dept);
    if (!p || !a) continue; // Only compare departments present in both docs

    // Filter out obvious data quality issues (>10x difference likely means wrong table picked up)
    if (p.amount > 0 && a.amount / p.amount > 10) continue;
    if (a.amount > 0 && p.amount / a.amount > 10) continue;

    const diff = a.amount - p.amount;
    const pct = p.amount > 0 ? (diff / p.amount) * 100 : 0;

    rows.push({
      department: dept,
      slug: p.slug || a.slug,
      proposed: p.amount,
      adopted: a.amount,
      difference: diff,
      pctChange: pct,
    });
  }

  return rows;
}

type SortKey = 'department' | 'proposed' | 'adopted' | 'difference' | 'pctChange';

export default function CrossYearComparison({ proposed, adopted, routePrefix }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('difference');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartWidth = useContainerWidth(chartContainerRef);

  const comparison = buildComparison(proposed, adopted);

  let filtered = showOnlyChanges
    ? comparison.filter(r => Math.abs(r.difference) > 10)
    : comparison;

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  // Summary stats
  const totalProposed = comparison.reduce((s, r) => s + r.proposed, 0);
  const totalAdopted = comparison.reduce((s, r) => s + r.adopted, 0);
  const totalDiff = totalAdopted - totalProposed;
  const changed = comparison.filter(r => Math.abs(r.difference) > 10);
  const unchanged = comparison.filter(r => Math.abs(r.difference) <= 10);

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir(key === 'department' ? 'asc' : 'desc');
    }
  }

  const arrow = (key: SortKey) => sortBy === key ? (sortDir === 'asc' ? ' \u25b2' : ' \u25bc') : '';

  // Chart: departments with changes, sorted by absolute difference
  useEffect(() => {
    if (!chartRef.current || changed.length === 0) return;
    const chartData = [...changed]
      .sort((a, b) => a.difference - b.difference)
      .slice(0, 20);

    const chart = Plot.plot({
      marginLeft: 220,
      width: chartWidth,
      height: Math.max(300, chartData.length * 28 + 60),
      x: { label: 'Change from Proposed to Adopted ($)', tickFormat: (d: number) => formatDollar(d) },
      y: { label: null },
      marks: [
        Plot.barX(chartData, {
          y: 'department',
          x: 'difference',
          fill: (d: ComparisonRow) => d.difference >= 0 ? '#16a34a' : '#DC2725',
          sort: { y: 'x' },
        }),
        Plot.ruleX([0]),
      ],
    });
    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [changed.length, showOnlyChanges, chartWidth]);

  return (
    <div>
      {/* Summary cards */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Departments Compared</div>
          <div class="text-lg font-semibold">{comparison.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Unchanged</div>
          <div class="text-lg font-semibold">{unchanged.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Changed by Council</div>
          <div class="text-lg font-semibold">{changed.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Net Change</div>
          <div class={`text-lg font-semibold ${totalDiff >= 0 ? 'text-green-600' : 'text-ps-red-600'}`}>
            {totalDiff >= 0 ? '+' : ''}{formatDollar(totalDiff)}
          </div>
        </div>
      </div>

      {/* Chart */}
      {changed.length > 0 && (
        <div ref={chartContainerRef} class="bg-white rounded-lg border p-4 mb-6">
          <h3 class="text-sm font-semibold text-gray-700 mb-2">Departments Changed by Council</h3>
          <div ref={chartRef} />
        </div>
      )}

      {/* Filter toggle */}
      <div class="mb-4">
        <label class="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOnlyChanges}
            onChange={(e) => setShowOnlyChanges((e.target as HTMLInputElement).checked)}
            class="rounded"
          />
          Show only departments with changes
        </label>
      </div>

      {/* Table */}
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="bg-gray-50 border-b">
              <th class="text-left p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('department')}>
                Department{arrow('department')}
              </th>
              <th class="text-right p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('proposed')}>
                2025 Proposed{arrow('proposed')}
              </th>
              <th class="text-right p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('adopted')}>
                2025 Adopted{arrow('adopted')}
              </th>
              <th class="text-right p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('difference')}>
                Change{arrow('difference')}
              </th>
              <th class="text-right p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('pctChange')}>
                % Change{arrow('pctChange')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.department} class={`border-b hover:bg-gray-50 ${Math.abs(row.difference) > 10 ? 'font-medium' : 'text-gray-500'}`}>
                <td class="p-2">
                  <a href={`${routePrefix}/sections/${row.slug}/`} class="text-ps-blue-600 hover:underline">{row.department}</a>
                </td>
                <td class="text-right p-2 font-mono">{formatDollar(row.proposed)}</td>
                <td class="text-right p-2 font-mono">{formatDollar(row.adopted)}</td>
                <td class={`text-right p-2 font-mono ${row.difference > 10 ? 'text-green-600' : row.difference < -10 ? 'text-ps-red-600' : ''}`}>
                  {Math.abs(row.difference) > 10 ? `${row.difference > 0 ? '+' : ''}${formatDollar(row.difference)}` : '\u2014'}
                </td>
                <td class={`text-right p-2 font-mono ${row.difference > 10 ? 'text-green-600' : row.difference < -10 ? 'text-ps-red-600' : ''}`}>
                  {Math.abs(row.difference) > 10 ? `${row.pctChange > 0 ? '+' : ''}${row.pctChange.toFixed(1)}%` : '\u2014'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr class="bg-gray-50 border-t-2 font-semibold">
              <td class="p-2">Total</td>
              <td class="text-right p-2 font-mono">{formatDollar(totalProposed)}</td>
              <td class="text-right p-2 font-mono">{formatDollar(totalAdopted)}</td>
              <td class={`text-right p-2 font-mono ${totalDiff >= 0 ? 'text-green-600' : 'text-ps-red-600'}`}>
                {totalDiff >= 0 ? '+' : ''}{formatDollar(totalDiff)}
              </td>
              <td class={`text-right p-2 font-mono ${totalDiff >= 0 ? 'text-green-600' : 'text-ps-red-600'}`}>
                {totalProposed > 0 ? `${totalDiff >= 0 ? '+' : ''}${((totalDiff / totalProposed) * 100).toFixed(1)}%` : '\u2014'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p class="text-xs text-gray-400 mt-4">
        "2025 Proposed" comes from the 2025 budget document (mayor's proposal).
        "2025 Adopted" comes from the 2026 budget document (council-approved figure).
        Departments with extreme discrepancies (&gt;10x) are excluded as likely data quality issues.
      </p>
    </div>
  );
}
