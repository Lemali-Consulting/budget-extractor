/**Tabbed view of new and eliminated positions.*/
import { useState } from 'preact/hooks';

interface Position {
  title: string;
  department: string;
  fte: number;
  budget: number;
}

interface Props {
  newPositions: Position[];
  eliminatedPositions: Position[];
}

function PositionTable({ positions, budgetLabel }: { positions: Position[]; budgetLabel: string }) {
  if (positions.length === 0) {
    return <p class="text-gray-400 italic text-sm py-4">None.</p>;
  }
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50">
            <th class="px-3 py-2 text-left font-medium text-gray-700 border-b">Title</th>
            <th class="px-3 py-2 text-left font-medium text-gray-700 border-b">Department</th>
            <th class="px-3 py-2 text-right font-medium text-gray-700 border-b">FTE</th>
            <th class="px-3 py-2 text-right font-medium text-gray-700 border-b">{budgetLabel}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => (
            <tr class={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td class="px-3 py-1.5 border-b border-gray-100">{p.title}</td>
              <td class="px-3 py-1.5 border-b border-gray-100">{p.department}</td>
              <td class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">{p.fte}</td>
              <td class="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums">
                {p.budget > 0 ? `$${p.budget.toLocaleString()}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PositionChanges({ newPositions, eliminatedPositions }: Props) {
  const [tab, setTab] = useState<'new' | 'eliminated'>('new');

  return (
    <div class="bg-white rounded-lg border p-4">
      <div class="flex gap-1 mb-4 border-b">
        <button
          onClick={() => setTab('new')}
          class={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === 'new'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          New Positions
          <span class="ml-1.5 text-xs bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">
            +{newPositions.length}
          </span>
        </button>
        <button
          onClick={() => setTab('eliminated')}
          class={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === 'eliminated'
              ? 'border-red-600 text-red-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Eliminated Positions
          <span class="ml-1.5 text-xs bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">
            -{eliminatedPositions.length}
          </span>
        </button>
      </div>

      {tab === 'new'
        ? <PositionTable positions={newPositions} budgetLabel="Budget" />
        : <PositionTable positions={eliminatedPositions} budgetLabel="Budget (2025)" />
      }
    </div>
  );
}
