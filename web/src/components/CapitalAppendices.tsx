/**Custom view for the Capital Budget Appendices section.
 *
 * The source PDF's three appendices (A: Projects by Department, B: CPFC
 * Scoring, C: Glossary) get fragmented by the spatial table extractor; this
 * component reads the cleaned data in views/capital-appendices.json and
 * renders each appendix appropriately — grouped projects for A, a sortable
 * + filterable scoring table with criteria legend for B, and a definition
 * list for C.*/

import { useMemo, useState } from 'preact/hooks';

interface ProjectRow {
  name: string;
  cdbg: number;
  bond: number;
  paygo: number;
  other: number;
  total: number;
}

interface Department {
  name: string;
  projects: ProjectRow[];
}

interface Totals {
  cdbg: number;
  bond: number;
  paygo: number;
  other: number;
  total: number;
}

interface ScoringRow {
  project: string;
  deliverable: string;
  city: number;
  cdbg: number;
  other: number;
  adjusted: number;
  omb1: string;
  omb2: string;
  omb3: string;
  cc1: string;
  cc2: string;
  co1: string;
  count: number;
  adjusted_count: number;
}

interface GlossaryEntry {
  acronym: string;
  name: string;
  description: string;
}

export interface AppendicesData {
  appendix_a: { departments: Department[]; totals: Totals };
  appendix_b: { scoring: ScoringRow[] };
  appendix_c: { entries: GlossaryEntry[] };
}

function fmtMoney(n: number): string {
  if (!n) return '—';
  return `$${n.toLocaleString()}`;
}

// ---------- Appendix A ----------

function AppendixA({ data, year }: { data: { departments: Department[]; totals: Totals }; year: number }) {
  return (
    <section id="appendix-a" class="scroll-mt-20">
      <h2 class="text-2xl font-semibold mt-10 mb-3">Appendix A — Projects by Department</h2>
      <p class="text-sm text-gray-600 mb-4 max-w-3xl">
        Every {year} capital project grouped by the department that owns it, with funding broken
        out by source (CDBG, Bond, Paygo, Other) and the project total.
      </p>
      <div class="overflow-x-auto border border-gray-200 rounded">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th class="text-left px-3 py-2">Project</th>
              <th class="text-right px-3 py-2">CDBG</th>
              <th class="text-right px-3 py-2">Bond</th>
              <th class="text-right px-3 py-2">Paygo</th>
              <th class="text-right px-3 py-2">Other</th>
              <th class="text-right px-3 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.departments.map((dept) => (
              <>
                <tr class="bg-blue-50">
                  <td colSpan={6} class="px-3 py-1.5 font-semibold text-blue-900 text-xs uppercase tracking-wide">
                    {dept.name}
                  </td>
                </tr>
                {dept.projects.map((p) => (
                  <tr class="border-t border-gray-100">
                    <td class="px-3 py-1.5">{p.name}</td>
                    <td class="text-right px-3 py-1.5 tabular-nums text-gray-700">{fmtMoney(p.cdbg)}</td>
                    <td class="text-right px-3 py-1.5 tabular-nums text-gray-700">{fmtMoney(p.bond)}</td>
                    <td class="text-right px-3 py-1.5 tabular-nums text-gray-700">{fmtMoney(p.paygo)}</td>
                    <td class="text-right px-3 py-1.5 tabular-nums text-gray-700">{fmtMoney(p.other)}</td>
                    <td class="text-right px-3 py-1.5 tabular-nums font-medium">{fmtMoney(p.total)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td class="px-3 py-2">Total</td>
              <td class="text-right px-3 py-2 tabular-nums">{fmtMoney(data.totals.cdbg)}</td>
              <td class="text-right px-3 py-2 tabular-nums">{fmtMoney(data.totals.bond)}</td>
              <td class="text-right px-3 py-2 tabular-nums">{fmtMoney(data.totals.paygo)}</td>
              <td class="text-right px-3 py-2 tabular-nums">{fmtMoney(data.totals.other)}</td>
              <td class="text-right px-3 py-2 tabular-nums">{fmtMoney(data.totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

// ---------- Appendix B ----------

const CPFC_CRITERIA: { key: keyof ScoringRow; label: string; tooltip: string }[] = [
  { key: 'omb1', label: 'OMB 1', tooltip: 'OMB criterion 1 — fiscal/operating impact' },
  { key: 'omb2', label: 'OMB 2', tooltip: 'OMB criterion 2 — strategic alignment' },
  { key: 'omb3', label: 'OMB 3', tooltip: 'OMB criterion 3 — equity / community benefit' },
  { key: 'cc1',  label: 'CC 1',  tooltip: 'City Council criterion 1' },
  { key: 'cc2',  label: 'CC 2',  tooltip: 'City Council criterion 2' },
  { key: 'co1',  label: 'CO 1',  tooltip: "Controller's Office criterion 1" },
];

type ScoreSortKey = 'project' | 'adjusted' | 'count' | 'adjusted_count';

function AppendixB({ data }: { data: { scoring: ScoringRow[] } }) {
  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [sortKey, setSortKey] = useState<ScoreSortKey>('adjusted_count');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let result = data.scoring;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) => r.project.toLowerCase().includes(q) || r.deliverable.toLowerCase().includes(q),
      );
    }
    if (minScore > 0) result = result.filter((r) => r.adjusted_count >= minScore);
    return [...result].sort((a, b) => {
      let av: string | number = '', bv: string | number = '';
      if (sortKey === 'project') { av = a.project; bv = b.project; }
      else if (sortKey === 'adjusted') { av = a.adjusted; bv = b.adjusted; }
      else if (sortKey === 'count') { av = a.count; bv = b.count; }
      else { av = a.adjusted_count; bv = b.adjusted_count; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
  }, [data.scoring, search, minScore, sortKey, sortAsc]);

  function toggleSort(key: ScoreSortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key === 'project');
    }
  }

  function sortIndicator(key: ScoreSortKey) {
    if (sortKey !== key) return '';
    return sortAsc ? ' ▲' : ' ▼';
  }

  function scoreBadge(val: string) {
    if (val === 'Y') return <span class="inline-block w-5 text-center text-green-700 font-semibold">Y</span>;
    if (val === 'N') return <span class="inline-block w-5 text-center text-gray-300">N</span>;
    return <span class="inline-block w-5 text-center text-gray-300">·</span>;
  }

  function adjBadge(score: number) {
    const color = score >= 5 ? 'bg-green-100 text-green-800' :
                  score >= 3.5 ? 'bg-yellow-100 text-yellow-800' :
                  score >= 2 ? 'bg-orange-100 text-orange-800' :
                  'bg-gray-100 text-gray-600';
    return <span class={`inline-block px-1.5 py-0.5 rounded text-xs font-medium tabular-nums ${color}`}>{score}</span>;
  }

  return (
    <section id="appendix-b" class="scroll-mt-20">
      <h2 class="text-2xl font-semibold mt-10 mb-2">Appendix B — CPFC Scoring</h2>
      <p class="text-sm text-gray-600 mb-3 max-w-3xl">
        The Capital Program Facilitation Committee scores each proposed deliverable on six
        criteria — three from OMB, two from City Council, one from the Controller's Office.
        Each criterion is Yes/No; <strong>Count</strong> is the total Yes votes,
        <strong> Adjusted Count</strong> weights criteria that were partially met.
        Higher scores indicate higher-priority projects.
      </p>

      <details class="text-xs text-gray-600 mb-4 bg-gray-50 border border-gray-200 rounded px-3 py-2 max-w-3xl">
        <summary class="cursor-pointer font-medium text-gray-700">Scoring criteria</summary>
        <ul class="mt-2 space-y-1">
          {CPFC_CRITERIA.map((c) => (
            <li><strong>{c.label}:</strong> {c.tooltip}</li>
          ))}
        </ul>
      </details>

      <div class="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <input
          type="search"
          placeholder="Search project or deliverable…"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          class="px-2 py-1 border border-gray-300 rounded text-sm w-64"
        />
        <label class="flex items-center gap-1.5 text-gray-700">
          Min score:
          <select
            value={minScore}
            onChange={(e) => setMinScore(parseFloat((e.target as HTMLSelectElement).value))}
            class="px-1.5 py-1 border border-gray-300 rounded text-sm"
          >
            <option value={0}>any</option>
            <option value={1}>≥ 1</option>
            <option value={2}>≥ 2</option>
            <option value={3}>≥ 3</option>
            <option value={4}>≥ 4</option>
            <option value={5}>≥ 5</option>
          </select>
        </label>
        <span class="text-gray-500">{filtered.length} of {data.scoring.length}</span>
      </div>

      <div class="overflow-x-auto border border-gray-200 rounded">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
            <tr>
              <th class="text-left px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort('project')}>
                Project / Deliverable{sortIndicator('project')}
              </th>
              <th class="text-right px-3 py-2 cursor-pointer select-none" onClick={() => toggleSort('adjusted')}>
                Adjusted ${sortIndicator('adjusted')}
              </th>
              {CPFC_CRITERIA.map((c) => (
                <th title={c.tooltip} class="px-1.5 py-2 text-center">{c.label}</th>
              ))}
              <th class="text-center px-2 py-2 cursor-pointer select-none" onClick={() => toggleSort('count')}>
                Count{sortIndicator('count')}
              </th>
              <th class="text-center px-2 py-2 cursor-pointer select-none" onClick={() => toggleSort('adjusted_count')}>
                Adj{sortIndicator('adjusted_count')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr class={i % 2 ? 'bg-gray-50/50' : ''}>
                <td class="px-3 py-1.5">
                  <div class="text-gray-800">{r.project}</div>
                  <div class="text-xs text-gray-500">{r.deliverable}</div>
                </td>
                <td class="text-right px-3 py-1.5 tabular-nums text-gray-700">{fmtMoney(r.adjusted)}</td>
                {CPFC_CRITERIA.map((c) => (
                  <td class="px-1.5 py-1.5 text-center">{scoreBadge(r[c.key] as string)}</td>
                ))}
                <td class="text-center px-2 py-1.5 tabular-nums text-gray-700">{r.count}</td>
                <td class="text-center px-2 py-1.5">{adjBadge(r.adjusted_count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- Appendix C ----------

function AppendixC({ data }: { data: { entries: GlossaryEntry[] } }) {
  return (
    <section id="appendix-c" class="scroll-mt-20">
      <h2 class="text-2xl font-semibold mt-10 mb-3">Appendix C — Glossary</h2>
      <p class="text-sm text-gray-600 mb-4 max-w-3xl">
        Acronyms and terms used throughout the Capital Budget.
      </p>
      <dl class="divide-y divide-gray-100 border border-gray-200 rounded">
        {data.entries.map((e) => (
          <div class="grid grid-cols-1 md:grid-cols-[minmax(0,15rem)_minmax(0,14rem)_minmax(0,1fr)] gap-2 md:gap-4 px-3 py-2.5">
            <dt class="font-mono font-semibold text-blue-700 break-words text-sm">{e.acronym}</dt>
            <dd class="text-gray-800 break-words">{e.name}</dd>
            <dd class="text-gray-600 text-sm">{e.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------- Top-level ----------

export default function CapitalAppendices({ data, year }: { data: AppendicesData; year: number }) {
  return (
    <div>
      <nav class="flex flex-wrap gap-3 text-sm bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-2">
        <span class="text-gray-500 font-medium">Jump to:</span>
        <a href="#appendix-a" class="text-blue-700 hover:underline">A · Projects by Department</a>
        <a href="#appendix-b" class="text-blue-700 hover:underline">B · CPFC Scoring</a>
        <a href="#appendix-c" class="text-blue-700 hover:underline">C · Glossary</a>
      </nav>
      <AppendixA data={data.appendix_a} year={year} />
      <AppendixB data={data.appendix_b} />
      <AppendixC data={data.appendix_c} />
    </div>
  );
}
