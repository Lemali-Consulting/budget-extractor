/**Data tab content: CSV download, print button, and table view.*/

import TableView from './TableView';

interface Table {
  headers: string[];
  rows: string[][];
  sections?: string[];
}

interface Props {
  table: Table;
  numericCols: number[];
  filename: string;
}

function downloadCsv(headers: string[], rows: string[][], filename: string): void {
  const lines = [headers, ...rows].map((r) =>
    r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')
  );
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataTab({ table, numericCols, filename }: Props) {
  return (
    <div>
      <div class="flex gap-2 mb-4">
        <button
          class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
          onClick={() => downloadCsv(table.headers, table.rows, filename)}
        >
          Download CSV
        </button>
        <button
          class="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
      <TableView
        headers={table.headers}
        rows={table.rows}
        sections={table.sections}
        numericCols={numericCols}
      />
    </div>
  );
}
