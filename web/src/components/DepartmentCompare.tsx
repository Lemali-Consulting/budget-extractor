/**Interactive multi-department comparison component.*/
import { useState, useRef, useEffect } from 'preact/hooks';
import * as Plot from '@observablehq/plot';
import GlossaryTip from './GlossaryTip';
import { FTE_TOOLTIP } from '../lib/glossary-terms';
import { useContainerWidth } from '../lib/hooks';

interface DeptBudget {
  department: string;
  slug: string;
  year: string;
  amount: number;
}

interface DeptPersonnel {
  department: string;
  slug: string;
  totalFte2025: number;
  totalFte2026: number;
  totalBudget2025: number;
  totalBudget2026: number;
  positionCount: number;
}

interface Props {
  budgets: DeptBudget[];
  personnel: DeptPersonnel[];
}

function formatDollar(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export default function DepartmentCompare({ budgets, personnel }: Props) {
  // Get unique departments
  const allDepts = [...new Set(personnel.map(p => p.department))].sort();

  // Read initial selections from URL
  const getInitialDepts = (): string[] => {
    if (typeof window === 'undefined') return allDepts.slice(0, 2);
    const params = new URLSearchParams(window.location.search);
    const depts = params.get('depts');
    if (depts) {
      const parsed = depts.split(',').filter(d => allDepts.includes(d));
      if (parsed.length >= 2) return parsed;
    }
    return allDepts.slice(0, 2);
  };

  const [selected, setSelected] = useState<string[]>(getInitialDepts);
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
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('depts', selected.join(','));
    window.history.replaceState({}, '', `?${params.toString()}`);
  }, [selected]);

  // Draw comparison chart
  useEffect(() => {
    if (!chartRef.current || selected.length < 2) return;

    const filteredBudgets = budgets.filter(b => selected.includes(b.department));
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
  }, [selected, budgets, containerWidth]);

  const selectedPersonnel = personnel.filter(p => selected.includes(p.department));

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
              onClick={() => toggle(dept)}
              class={`px-3 py-1 rounded-full text-xs border transition ${
                selected.includes(dept)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
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
          <div key={p.department} class="bg-white rounded-lg border p-4">
            <a href={`/sections/${p.slug}/`} class="text-sm font-semibold text-blue-700 hover:underline block mb-2 truncate" title={p.department}>
              {p.department}
            </a>
            <div class="space-y-1 text-sm">
              <div>
                <span class="text-gray-500">2026 Budget:</span>{' '}
                <span class="font-medium">{formatDollar(p.totalBudget2026)}</span>
              </div>
              <div>
                <span class="text-gray-500"><GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} />:</span>{' '}
                <span class="font-medium">{Math.round(p.totalFte2026)}</span>
                {p.totalFte2025 > 0 && (
                  <span class={`ml-1 text-xs ${p.totalFte2026 >= p.totalFte2025 ? 'text-green-600' : 'text-red-600'}`}>
                    ({p.totalFte2026 >= p.totalFte2025 ? '+' : ''}{Math.round(p.totalFte2026 - p.totalFte2025)})
                  </span>
                )}
              </div>
              <div>
                <span class="text-gray-500">Positions:</span>{' '}
                <span class="font-medium">{p.positionCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div ref={chartContainerRef} class="bg-white rounded-lg border p-4 mb-6">
        <h3 class="text-lg font-semibold mb-3">Budget Trend</h3>
        <div ref={chartRef} />
      </div>

      <div class="bg-white rounded-lg border p-4">
        <h3 class="text-lg font-semibold mb-3">Side-by-Side</h3>
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
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">2026 Budget</td>
                {selectedPersonnel.map(p => (
                  <td key={p.department} class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">{formatDollar(p.totalBudget2026)}</td>
                ))}
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">2025 Budget</td>
                {selectedPersonnel.map(p => (
                  <td key={p.department} class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">{formatDollar(p.totalBudget2025)}</td>
                ))}
              </tr>
              <tr class="bg-white">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">Budget Change</td>
                {selectedPersonnel.map(p => {
                  const change = p.totalBudget2026 - p.totalBudget2025;
                  const pct = p.totalBudget2025 > 0 ? ((change / p.totalBudget2025) * 100).toFixed(1) : '0';
                  return (
                    <td key={p.department} class={`px-3 py-1.5 border-b border-gray-100 text-right tabular-nums ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatDollar(change)} ({change >= 0 ? '+' : ''}{pct}%)
                    </td>
                  );
                })}
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">2026 <GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} /></td>
                {selectedPersonnel.map(p => (
                  <td key={p.department} class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">{Math.round(p.totalFte2026)}</td>
                ))}
              </tr>
              <tr class="bg-white">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium"><GlossaryTip term="FTE" tooltip={FTE_TOOLTIP} /> Change</td>
                {selectedPersonnel.map(p => {
                  const change = Math.round(p.totalFte2026 - p.totalFte2025);
                  return (
                    <td key={p.department} class={`px-3 py-1.5 border-b border-gray-100 text-right tabular-nums ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {change >= 0 ? '+' : ''}{change}
                    </td>
                  );
                })}
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-1.5 border-b border-gray-100 font-medium">Total Positions</td>
                {selectedPersonnel.map(p => (
                  <td key={p.department} class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">{p.positionCount}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
