/**Interactive multi-department comparison component: total budgets, staffing and budget trend for 2–4 departments.*/
import { useState, useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import GlossaryTip from './GlossaryTip';
import { FTE_TOOLTIP } from '../lib/glossary-terms';
import { useContainerWidth } from '../lib/hooks';
import type { CompareDepartment } from '../lib/compare-departments';

interface DeptBudget {
  department: string;
  slug: string;
  year: string;
  amount: number;
}

interface Props {
  /** Budget rows for the trend chart, for the offered departments only. */
  budgets: DeptBudget[];
  /** The departments offered, from compareDepartments. */
  departments: CompareDepartment[];
  /** Budget year compared, and the year it is compared with, for column labels. */
  year: number;
  priorYear: number;
}

function formatDollar(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export default function DepartmentCompare({ budgets, departments, year, priorYear }: Props) {
  const allDepts = departments.map(d => d.department);

  const defaultDepts = allDepts.slice(0, 2);
  // Start from the default so the first render matches the server's markup,
  // then apply a shared link's ?depts= once the page has hydrated.
  const [selected, setSelected] = useState<string[]>(defaultDepts);
  const [urlRead, setUrlRead] = useState(false);
  useEffect(() => {
    const depts = new URLSearchParams(window.location.search).get('depts');
    const parsed = depts ? depts.split(',').filter(d => allDepts.includes(d)) : [];
    if (parsed.length >= 2) setSelected(parsed);
    setUrlRead(true);
  }, []);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(chartContainerRef);

  const toggle = (dept: string) => {
    setSelected(prev => {
      if (prev.includes(dept)) {
        if (prev.length <= 2) return prev;
        return prev.filter(d => d !== dept);
      }
      if (prev.length >= 4) return prev;
      return [...prev, dept];
    });
  };

  // Update URL when selection changes
  useEffect(() => {
    if (!urlRead) return;
    const params = new URLSearchParams(window.location.search);
    params.set('depts', selected.join(','));
    window.history.replaceState({}, '', `?${params.toString()}`);
  }, [selected, urlRead]);

  // Draw comparison chart
  useEffect(() => {
    if (!chartRef.current || selected.length < 2) return;

    const selectedSlugs = new Set(departments.filter(d => selected.includes(d.department)).map(d => d.slug));
    const nameBySlug = new Map(departments.map(d => [d.slug, d.department]));
    const filteredBudgets = budgets
      .filter(b => selectedSlugs.has(b.slug))
      .map(b => ({ ...b, department: nameBySlug.get(b.slug) ?? b.department }));
    if (filteredBudgets.length === 0) return;

    const years = [...new Set(filteredBudgets.map(b => parseInt(b.year.split(' ')[0])))].sort();
    const chart = Plot.plot({
      marginLeft: 60,
      width: containerWidth,
      height: 300,
      color: { legend: true },
      x: { label: 'Year', tickFormat: (d: number) => String(d), ticks: years },
      y: { label: 'Budget', tickFormat: (d: number) => formatDollar(d) },
      marks: [
        Plot.line(filteredBudgets, {
          x: (d: DeptBudget) => parseInt(d.year.split(' ')[0]),
          y: 'amount',
          stroke: 'department',
          strokeWidth: 2,
          marker: 'dot',
        }),
      ],
    });

    chartRef.current.innerHTML = '';
    chartRef.current.appendChild(chart);
    return () => chart.remove();
  }, [selected, budgets, departments, containerWidth]);

  const selectedPersonnel = departments.filter(d => selected.includes(d.department));

  return (
    <div>
      <div class="bg-white rounded-lg border p-4 mb-6">
        <h3 class="text-sm font-semibold text-gray-700 mb-2">
          Select 2-4 departments to compare
        </h3>
        <div class="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {allDepts.map(dept => (
            <button
              key={dept}
              data-testid="compare-chip"
              onClick={() => toggle(dept)}
              class={`px-3 py-1 rounded-full text-xs border transition ${
                selected.includes(dept)
                  ? 'bg-ps-blue-600 text-white border-ps-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-ps-blue-400'
              } ${!selected.includes(dept) && selected.length >= 4 ? 'opacity-40 cursor-not-allowed' : ''}`}
              disabled={!selected.includes(dept) && selected.length >= 4}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {selectedPersonnel.map(p => (
          <div key={p.department} class="bg-white rounded-lg border p-4" data-testid="compare-card">
            {p.href ? (
              <a href={p.href} class="text-sm font-semibold text-ps-blue-700 hover:underline block mb-2 truncate" title={p.department}>
                {p.department}
              </a>
            ) : (
              <div class="text-sm font-semibold text-gray-700 block mb-2 truncate" title={p.department}>{p.department}</div>
            )}
            <div class="space-y-1 text-sm">
              <div>
                <span class="text-gray-500">{year} budget:</span>{' '}
                <span class="font-medium">{formatDollar(p.budgetCurrent)}</span>
              </div>
              <div>
                <span class="text-gray-500"><GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} />:</span>{' '}
                <span class="font-medium">{Math.round(p.fteCurrent)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div ref={chartContainerRef} class="bg-white rounded-lg border p-4 mb-6">
        <h3 class="text-lg font-semibold mb-3">Budget trend</h3>
        <div ref={chartRef} />
      </div>

      <div class="bg-white rounded-lg border p-4">
        <h3 class="text-lg font-semibold mb-3">Side by side</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50">
                <th class="px-3 py-2 text-left font-medium text-gray-700 border-b">Metric</th>
                {selectedPersonnel.map(p => (
                  <th key={p.department} class="px-3 py-2 text-right font-medium text-gray-700 border-b">{p.department}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr class="bg-white">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">{year} budget</td>
                {selectedPersonnel.map(p => (
                  <td key={p.department} class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">{formatDollar(p.budgetCurrent)}</td>
                ))}
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">{priorYear} budget</td>
                {selectedPersonnel.map(p => (
                  <td key={p.department} class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">{formatDollar(p.budgetPrior)}</td>
                ))}
              </tr>
              <tr class="bg-white">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">Budget change</td>
                {selectedPersonnel.map(p => {
                  const change = p.budgetCurrent - p.budgetPrior;
                  const pct = p.budgetPrior > 0 ? ((change / p.budgetPrior) * 100).toFixed(1) : '0';
                  return (
                    <td key={p.department} class={`px-3 py-1.5 border-b border-gray-100 text-right tabular-nums ${change >= 0 ? 'text-green-600' : 'text-ps-red-600'}`}>
                      {formatDollar(change)} ({change >= 0 ? '+' : ''}{pct}%)
                    </td>
                  );
                })}
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">{year} <GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} /></td>
                {selectedPersonnel.map(p => (
                  <td key={p.department} class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">{Math.round(p.fteCurrent)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
