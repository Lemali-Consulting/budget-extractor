/**Cross-year capital project comparison: projects added, dropped, or consolidated between proposed and adopted.*/
import { useState } from 'preact/hooks';

interface CapitalProject {
  title: string;
  slug: string;
  functionalArea: string;
  department: string;
  projectType: string;
}

interface Props {
  proposedProjects: CapitalProject[];
  adoptedProjects: CapitalProject[];
  /** Route prefix of the archive year the links point into (e.g. "/2026"). */
  routePrefix: string;
}

// Known project consolidations (proposed entries that were merged in the adopted budget)
const CONSOLIDATIONS: Record<string, string> = {
  'P.J. MCARDLE ROADWAY BRIDGE OVER HILLSIDE (TIP)': 'P.J. MCARDLE ROADWAY (TIP)',
  'P.J. MCARDLE ROADWAY BRIDGE OVER SYCAMORE (TIP)': 'P.J. MCARDLE ROADWAY (TIP)',
};

export default function CrossYearCapital({ proposedProjects, adoptedProjects, routePrefix }: Props) {
  const [view, setView] = useState<'all' | 'added' | 'dropped'>('all');

  const proposedTitles = new Set(proposedProjects.map(p => p.title));
  const adoptedTitles = new Set(adoptedProjects.map(p => p.title));

  const inBoth = proposedProjects.filter(p => adoptedTitles.has(p.title));
  const onlyProposed = proposedProjects.filter(p => !adoptedTitles.has(p.title));
  const onlyAdopted = adoptedProjects.filter(p => !proposedTitles.has(p.title));

  // Check for metadata changes in shared projects (only where both sides have values)
  const adoptedMap = new Map(adoptedProjects.map(p => [p.title, p]));
  function bothNonEmpty(a: string, b: string): boolean {
    return !!(a && b);
  }
  const metadataChanges = inBoth.filter(p => {
    const a = adoptedMap.get(p.title);
    if (!a) return false;
    return (bothNonEmpty(p.functionalArea, a.functionalArea) && p.functionalArea !== a.functionalArea)
      || (bothNonEmpty(p.department, a.department) && p.department !== a.department)
      || (bothNonEmpty(p.projectType, a.projectType) && p.projectType !== a.projectType);
  });

  return (
    <div>
      {/* Summary cards */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">In both</div>
          <div class="text-lg font-semibold">{inBoth.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Added by Council</div>
          <div class="text-lg font-semibold text-green-600">{onlyAdopted.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Dropped / consolidated</div>
          <div class="text-lg font-semibold text-ps-red-600">{onlyProposed.length}</div>
        </div>
        <div class="bg-white rounded-lg border p-4">
          <div class="text-xs text-gray-500 mb-1">Metadata changed</div>
          <div class="text-lg font-semibold text-ps-yellow-600">{metadataChanges.length}</div>
        </div>
      </div>

      {/* View toggle */}
      <div class="flex gap-1 mb-4">
        {(['all', 'added', 'dropped'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            class={`px-3 py-1.5 text-sm rounded-md ${view === v ? 'bg-ps-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {v === 'all' ? `All projects (${inBoth.length + onlyAdopted.length + onlyProposed.length})` : v === 'added' ? `Added (${onlyAdopted.length})` : `Dropped (${onlyProposed.length})`}
          </button>
        ))}
      </div>

      {/* Added projects */}
      {(view === 'all' || view === 'added') && onlyAdopted.length > 0 && (
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-green-700 mb-2">Projects added in adopted budget</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="bg-green-50 border-b">
                  <th class="text-left p-2">Project</th>
                  <th class="text-left p-2">Functional area</th>
                  <th class="text-left p-2">Department</th>
                  <th class="text-left p-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {onlyAdopted.map(p => (
                  <tr key={p.title} class="border-b hover:bg-gray-50">
                    <td class="p-2">
                      <a href={`${routePrefix}/capital/${p.slug}/`} class="text-ps-blue-600 hover:underline">{p.title}</a>
                    </td>
                    <td class="p-2 text-gray-600">{p.functionalArea || '\u2014'}</td>
                    <td class="p-2 text-gray-600">{p.department || '\u2014'}</td>
                    <td class="p-2 text-gray-600">{p.projectType || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dropped projects */}
      {(view === 'all' || view === 'dropped') && onlyProposed.length > 0 && (
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-ps-red-700 mb-2">Projects dropped or consolidated</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="bg-ps-red-50 border-b">
                  <th class="text-left p-2">Project</th>
                  <th class="text-left p-2">Functional area</th>
                  <th class="text-left p-2">Type</th>
                  <th class="text-left p-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {onlyProposed.map(p => {
                  const consolidatedInto = CONSOLIDATIONS[p.title];
                  return (
                    <tr key={p.title} class="border-b hover:bg-gray-50">
                      <td class="p-2">{p.title}</td>
                      <td class="p-2 text-gray-600">{p.functionalArea || '\u2014'}</td>
                      <td class="p-2 text-gray-600">{p.projectType || '\u2014'}</td>
                      <td class="p-2 text-gray-500 text-xs italic">
                        {consolidatedInto ? `Consolidated into ${consolidatedInto}` : 'Dropped'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Projects in both with metadata changes */}
      {view === 'all' && metadataChanges.length > 0 && (
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-ps-yellow-700 mb-2">Projects with metadata changes</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="bg-ps-yellow-50 border-b">
                  <th class="text-left p-2">Project</th>
                  <th class="text-left p-2">Field</th>
                  <th class="text-left p-2">Proposed</th>
                  <th class="text-left p-2">Adopted</th>
                </tr>
              </thead>
              <tbody>
                {metadataChanges.flatMap(p => {
                  const a = adoptedMap.get(p.title)!;
                  const diffs: { field: string; from: string; to: string }[] = [];
                  if (p.functionalArea !== a.functionalArea) diffs.push({ field: 'Functional area', from: p.functionalArea || '(none)', to: a.functionalArea || '(none)' });
                  if (p.department !== a.department) diffs.push({ field: 'Department', from: p.department || '(none)', to: a.department || '(none)' });
                  if (p.projectType !== a.projectType) diffs.push({ field: 'Type', from: p.projectType || '(none)', to: a.projectType || '(none)' });
                  return diffs.map((d, i) => (
                    <tr key={`${p.title}-${d.field}`} class="border-b hover:bg-gray-50">
                      {i === 0 && (
                        <td class="p-2" rowSpan={diffs.length}>
                          <a href={`${routePrefix}/capital/${p.slug}/`} class="text-ps-blue-600 hover:underline">{p.title}</a>
                        </td>
                      )}
                      <td class="p-2 text-gray-600">{d.field}</td>
                      <td class="p-2 text-ps-red-600">{d.from}</td>
                      <td class="p-2 text-green-600">{d.to}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p class="text-xs text-gray-400 mt-4">
        Projects matched by exact title. Some "dropped" projects may have been consolidated
        under a new name in the adopted budget.
      </p>
    </div>
  );
}
