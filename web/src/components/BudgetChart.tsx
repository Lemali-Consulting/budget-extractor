/**Bar chart comparing budget figures across departments using Observable Plot.*/

import { useEffect, useRef, useState } from 'preact/hooks';
import * as Plot from '@observablehq/plot';

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

interface BudgetRow {
  department: string;
  year: string;
  amount: number;
}

function parseCurrency(s: string): number | null {
  if (!s || s === '—') return null;
  const cleaned = s.replace(/[$,()]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractBudgetData(sections: Section[]): BudgetRow[] {
  const rows: BudgetRow[] = [];

  for (const section of sections) {
    for (const table of section.tables) {
      if (table.table_type !== 'financial_summary' && table.table_type !== 'financial') continue;

      const headers = table.headers;
      const budgetCols: { year: string; idx: number }[] = [];

      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (/\d{4}\s*(budget|actual)/i.test(h)) {
          const match = h.match(/(\d{4})\s*(Budget|Actual)/i);
          if (match) budgetCols.push({ year: `${match[1]} ${match[2]}`, idx: i });
        }
      }

      if (budgetCols.length === 0) continue;

      // Find a "total" row or use the last row
      for (const row of table.rows) {
        const label = (row[0] || '').toLowerCase();
        if (label.includes('total') && !label.includes('subtotal')) {
          for (const col of budgetCols) {
            const amount = parseCurrency(row[col.idx]);
            if (amount && amount > 0) {
              rows.push({ department: section.title, year: col.year, amount });
            }
          }
          break;
        }
      }
    }
  }

  return rows;
}

export default function BudgetChart({ sections }: { sections: Section[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedYear, setSelectedYear] = useState<string>('');

  const data = extractBudgetData(sections);
  const years = [...new Set(data.map((d) => d.year))].sort();

  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[years.length - 1]);
    }
  }, [years]);

  useEffect(() => {
    if (!containerRef.current || !selectedYear) return;

    const filtered = data
      .filter((d) => d.year === selectedYear)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);

    if (filtered.length === 0) {
      containerRef.current.textContent = 'No budget data available for this year.';
      return;
    }

    const chart = Plot.plot({
      marginLeft: 220,
      width: 700,
      height: Math.max(300, filtered.length * 30),
      x: { label: 'Amount ($)', tickFormat: (d: number) => `$${(d / 1_000_000).toFixed(1)}M` },
      y: { label: null },
      marks: [
        Plot.barX(filtered, {
          x: 'amount',
          y: 'department',
          fill: '#2563eb',
          sort: { y: '-x' },
        }),
        Plot.text(filtered, {
          x: 'amount',
          y: 'department',
          text: (d: BudgetRow) => `$${(d.amount / 1_000_000).toFixed(1)}M`,
          dx: 4,
          textAnchor: 'start',
          fontSize: 11,
        }),
        Plot.ruleX([0]),
      ],
    });

    containerRef.current.replaceChildren(chart);
    return () => chart.remove();
  }, [selectedYear, data]);

  if (data.length === 0) {
    return (
      <div class="text-gray-400 italic py-4">
        No comparable budget totals found across sections.
      </div>
    );
  }

  return (
    <div>
      <div class="flex items-center gap-3 mb-4">
        <label class="text-sm font-medium text-gray-700">Year:</label>
        <select
          class="border rounded px-2 py-1 text-sm"
          value={selectedYear}
          onChange={(e) => setSelectedYear((e.target as HTMLSelectElement).value)}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
