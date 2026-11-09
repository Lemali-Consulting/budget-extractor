/**Cross-year personnel comparison: position-level proposed vs adopted FTE and budget.*/
import { useState, useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import { useContainerWidth } from '../lib/hooks';
import GlossaryTip from './GlossaryTip';
import { FTE_TOOLTIP } from '../lib/glossary-terms';

interface PersonnelRecord {
  department: string;
  slug: string;
  title: string;
  fte2025?: number | null;
  budget2025?: number | null;
  [key: string]: unknown;
}

interface MatchedPosition {
  department: string;
  slug: string;
  title: string;
  proposedFte: number;
  adoptedFte: number;
  fteDiff: number;
  proposedBudget: number;
  adoptedBudget: number;
  budgetDiff: number;
}

interface UnmatchedPosition {
  department: string;
  slug: string;
  title: string;
  fte: number;
  budget: number;
}

interface Props {
  proposedPersonnel: PersonnelRecord[];
  adoptedPersonnel: PersonnelRecord[];
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

function normalizeTitle(title: string): string {
  return title.replace(/\*+$/, '').trim().toLowerCase();
}

type SortKey = 'department' | 'title' | 'proposedBudget' | 'adoptedBudget' | 'budgetDiff' | 'fteDiff';

function buildComparison(proposed: PersonnelRecord[], adopted: PersonnelRecord[]) {
  const proposedMap = new Map<string, PersonnelRecord>();
  const adoptedMap = new Map<string, PersonnelRecord>();

  for (const r of proposed) {
    const key = `${r.department}|||${normalizeTitle(r.title)}`;
    proposedMap.set(key, r);
  }
  for (const r of adopted) {
    const key = `${r.department}|||${normalizeTitle(r.title)}`;
    adoptedMap.set(key, r);
  }

  const matched: MatchedPosition[] = [];
  const addedInAdopted: UnmatchedPosition[] = [];
  const removedFromProposed: UnmatchedPosition[] = [];

  const allKeys = new Set([...proposedMap.keys(), ...adoptedMap.keys()]);

  for (const key of allKeys) {
    const p = proposedMap.get(key);
    const a = adoptedMap.get(key);

    if (p && a) {
      const pFte = p.fte2025 ?? 0;
      const aFte = a.fte2025 ?? 0;
      const pBudget = p.budget2025 ?? 0;
      const aBudget = a.budget2025 ?? 0;
      const budgetDiff = aBudget - pBudget;
      const fteDiff = aFte - pFte;

      if (Math.abs(budgetDiff) > 100 || Math.abs(fteDiff) > 0.01) {
        matched.push({
          department: p.department,
          slug: p.slug || a.slug,
          title: p.title,
          proposedFte: pFte,
          adoptedFte: aFte,
          fteDiff,
          proposedBudget: pBudget,
          adoptedBudget: aBudget,
          budgetDiff,
        });
      }
    } else if (a && !p) {
      const fte = a.fte2025 ?? 0;
      const budget = a.budget2025 ?? 0;
      if (budget > 0 || fte > 0) {
        addedInAdopted.push({ department: a.department, slug: a.slug, title: a.title, fte, budget });
      }
    } else if (p && !a) {
      const fte = p.fte2025 ?? 0;
      const budget = p.budget2025 ?? 0;
      if (budget > 0 || fte > 0) {
        removedFromProposed.push({ department: p.department, slug: p.slug, title: p.title, fte, budget });
      }
    }
  }

  return { matched, addedInAdopted, removedFromProposed };
}

export default function CrossYearPersonnel({ proposedPersonnel, adoptedPersonnel, routePrefix }: Props) {
  const { matched, addedInAdopted, removedFromProposed } = buildComparison(proposedPersonnel, adoptedPersonnel);
  const [view, setView] = useState<'changed' | 'added' | 'removed'>('changed');
  const [sortBy, setSortBy] = useState<SortKey>('budgetDiff');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartWidth = useContainerWidth(chartContainerRef);

  const allDepts = [...new Set([
    ...matched.map(r => r.department),
    ...addedInAdopted.map(r => r.department),
    ...removedFromProposed.map(r => r.department),
  ])].sort();

  // Summary stats
  const netBudgetChange = matched.reduce((s, r) => s + r.budgetDiff, 0)
    + addedInAdopted.reduce((s, r) => s + r.budget, 0)
    - removedFromProposed.reduce((s, r) => s + r.budget, 0);
  const netFteChange = matched.reduce((s, r) => s + r.fteDiff, 0)
    + addedInAdopted.reduce((s, r) => s + r.fte, 0)
    - removedFromProposed.reduce((s, r) => s + r.fte, 0);

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir(key === 'department' || key === 'title' ? 'asc' : 'desc');
    }
  }

  const arrow = (key: SortKey) => sortBy === key ? (sortDir === 'asc' ? ' \u25b2' : ' \u25bc') : '';

  function sortRows<T extends Record<string, unknown>>(rows: T[], key: string, dir: 'asc' | 'desc'): T[] {
    return [...rows].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return dir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }

  // Department-level aggregation for chart
  useEffect(() => {
    if (!chartRef.current) return;

    const deptChanges = new Map<string, number>();
    for (const r of matched) {
      deptChanges.set(r.department, (deptChanges.get(r.department) ?? 0) + r.budgetDiff);
    }
    for (const r of addedInAdopted) {
      deptChanges.set(r.department, (deptChanges.get(r.department) ?? 0) + r.budget);
    }
    for (const r of removedFromProposed) {
      deptChanges.set(r.department, (deptChanges.get(r.department) ?? 0) - r.budget);
    }

    const chartData = [...deptChanges.entries()]
      .filter(([, v]) => Math.abs(v) > 100)
      .map(([department, change]) => ({ department, change }))
      .sort((a, b) => a.change - b.change)
      .slice(0, 20);

    if (chartData.length === 0) return;

    const chart = Plot.plot({
      marginLeft: 220,
      width: chartWidth,
      height: Math.max(300, chartData.length * 28 + 60),
      x: { label: 'Personnel Budget Change ($)', tickFormat: (d: number) => formatDollar(d) },
      y: { label: null },
      marks: [
        Plot.barX(chartData, {
          y: 'department',
          x: 'change',
          fill: (d: { change: number }) => d.change >= 0 ? '#16a34a' : '#DC2725',
          sort: { y: 'x' },
        }),
        Plot.ruleX([0]),
      ],
    });
    chartRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [matched.length, addedInAdopted.length, removedFromProposed.length, chartWidth]);

  const filteredMatched = deptFilter ? matched.filter(r => r.department === deptFilter) : matched;
  const filteredAdded = deptFilter ? addedInAdopted.filter(r => r.department === deptFilter) : addedInAdopted;
  const filteredRemoved = deptFilter ? removedFromProposed.filter(r => r.department === deptFilter) : removedFromProposed;

  const sortedMatched = sortRows(filteredMatched, sortBy, sortDir);
  const sortedAdded = sortRows(filteredAdded, sortBy === 'budgetDiff' ? 'budget' : sortBy === 'fteDiff' ? 'fte' : sortBy, sortDir);
  const sortedRemoved = sortRows(filteredRemoved, sortBy === 'budgetDiff' ? 'budget' : sortBy === 'fteDiff' ? 'fte' : sortBy, sortDir);

  return (
    <div>
      {/* Summary cards */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Positions Changed</div>
          <div class="text-lg font-semibold">{matched.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Positions Added</div>
          <div class="text-lg font-semibold text-green-600">{addedInAdopted.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Positions Removed</div>
          <div class="text-lg font-semibold text-ps-red-600">{removedFromProposed.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Net <GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} /> Change</div>
          <div class={`text-lg font-semibold ${netFteChange >= 0 ? 'text-green-600' : 'text-ps-red-600'}`}>
            {netFteChange >= 0 ? '+' : ''}{netFteChange.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} class="bg-white rounded-lg border p-4 mb-6">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">Personnel Budget Changes by Department</h3>
        <div ref={chartRef} />
      </div>

      {/* Controls */}
      <div class="flex flex-wrap gap-4 mb-4 items-center">
        <div class="flex gap-1">
          {(['changed', 'added', 'removed'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              class={`px-3 py-1.5 text-sm rounded-md ${view === v ? 'bg-ps-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {v === 'changed' ? `Changed (${matched.length})` : v === 'added' ? `Added (${addedInAdopted.length})` : `Removed (${removedFromProposed.length})`}
            </button>
          ))}
        </div>
        <select
          class="text-sm border rounded-md px-2 py-1.5"
          value={deptFilter}
          onChange={(e) => setDeptFilter((e.target as HTMLSelectElement).value)}
        >
          <option value="">All departments</option>
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Table: Changed positions */}
      {view === 'changed' && (
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b">
                <th class="text-left p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('department')}>Dept{arrow('department')}</th>
                <th class="text-left p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('title')}>Position{arrow('title')}</th>
                <th class="text-right p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fteDiff')}><GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} /> +/-{arrow('fteDiff')}</th>
                <th class="text-right p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('proposedBudget')}>Proposed{arrow('proposedBudget')}</th>
                <th class="text-right p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('adoptedBudget')}>Adopted{arrow('adoptedBudget')}</th>
                <th class="text-right p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('budgetDiff')}>Change{arrow('budgetDiff')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedMatched.map(row => (
                <tr key={`${row.department}-${row.title}`} class="border-b hover:bg-gray-50">
                  <td class="p-2 text-gray-600 max-w-[180px] truncate" title={row.department}>
                    <a href={`${routePrefix}/sections/${row.slug}/`} class="text-ps-blue-600 hover:underline">{row.department}</a>
                  </td>
                  <td class="p-2">{row.title}</td>
                  <td class={`text-right p-2 font-mono ${row.fteDiff > 0 ? 'text-green-600' : row.fteDiff < 0 ? 'text-ps-red-600' : ''}`}>
                    {Math.abs(row.fteDiff) > 0.01 ? `${row.fteDiff > 0 ? '+' : ''}${row.fteDiff.toFixed(0)}` : '\u2014'}
                  </td>
                  <td class="text-right p-2 font-mono">{formatDollar(row.proposedBudget)}</td>
                  <td class="text-right p-2 font-mono">{formatDollar(row.adoptedBudget)}</td>
                  <td class={`text-right p-2 font-mono ${row.budgetDiff > 0 ? 'text-green-600' : 'text-ps-red-600'}`}>
                    {row.budgetDiff > 0 ? '+' : ''}{formatDollar(row.budgetDiff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedMatched.length === 0 && <p class="text-gray-500 text-sm mt-2">No changed positions{deptFilter ? ` in ${deptFilter}` : ''}.</p>}
        </div>
      )}

      {/* Table: Added positions */}
      {view === 'added' && (
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b">
                <th class="text-left p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('department')}>Dept{arrow('department')}</th>
                <th class="text-left p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('title')}>Position{arrow('title')}</th>
                <th class="text-right p-2"><GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} /></th>
                <th class="text-right p-2">Budget</th>
              </tr>
            </thead>
            <tbody>
              {sortedAdded.map(row => (
                <tr key={`${row.department}-${row.title}`} class="border-b hover:bg-gray-50">
                  <td class="p-2 text-gray-600 max-w-[180px] truncate" title={row.department}>
                    <a href={`${routePrefix}/sections/${row.slug}/`} class="text-ps-blue-600 hover:underline">{row.department}</a>
                  </td>
                  <td class="p-2">{row.title}</td>
                  <td class="text-right p-2 font-mono">{row.fte > 0 ? row.fte.toFixed(0) : '\u2014'}</td>
                  <td class="text-right p-2 font-mono text-green-600">{row.budget > 0 ? `+${formatDollar(row.budget)}` : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedAdded.length === 0 && <p class="text-gray-500 text-sm mt-2">No added positions{deptFilter ? ` in ${deptFilter}` : ''}.</p>}
        </div>
      )}

      {/* Table: Removed positions */}
      {view === 'removed' && (
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b">
                <th class="text-left p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('department')}>Dept{arrow('department')}</th>
                <th class="text-left p-2 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('title')}>Position{arrow('title')}</th>
                <th class="text-right p-2"><GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} /></th>
                <th class="text-right p-2">Budget</th>
              </tr>
            </thead>
            <tbody>
              {sortedRemoved.map(row => (
                <tr key={`${row.department}-${row.title}`} class="border-b hover:bg-gray-50">
                  <td class="p-2 text-gray-600 max-w-[180px] truncate" title={row.department}>
                    <a href={`${routePrefix}/sections/${row.slug}/`} class="text-ps-blue-600 hover:underline">{row.department}</a>
                  </td>
                  <td class="p-2">{row.title}</td>
                  <td class="text-right p-2 font-mono">{row.fte > 0 ? row.fte.toFixed(0) : '\u2014'}</td>
                  <td class="text-right p-2 font-mono text-ps-red-600">{row.budget > 0 ? `-${formatDollar(row.budget)}` : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedRemoved.length === 0 && <p class="text-gray-500 text-sm mt-2">No removed positions{deptFilter ? ` in ${deptFilter}` : ''}.</p>}
        </div>
      )}

      <p class="text-xs text-gray-400 mt-4">
        Positions matched by department and title (normalized). Only positions with non-zero 2025 budget or FTE are shown in added/removed lists.
      </p>
    </div>
  );
}
