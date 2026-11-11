/**Reusable budget table renderer with section dividers, total-row highlighting, and numeric alignment.*/
import { columnHeaderLabel } from '../../lib/text-case';

interface Props {
  headers: string[];
  rows: string[][];
  sections?: string[];
  numericCols?: number[];
}

export default function TableView({ headers, rows, sections = [], numericCols }: Props) {
  const colCount = headers.length;
  const numSet = new Set(numericCols || []);

  function isTotalRow(row: string[]): boolean {
    const cell = (row[0] || '').trim().toLowerCase();
    return cell.startsWith('total') || cell.endsWith('total');
  }

  return (
    <div class="overflow-x-auto border rounded-lg print:border-none">
      <table class="w-full text-sm">
        {headers.length > 0 && (
          <thead>
            <tr class="bg-gray-50">
              {headers.map((h, i) => (
                <th key={i} class={`px-3 py-2 font-medium text-gray-700 border-b whitespace-nowrap ${numSet.has(i) ? 'text-right tabular-nums' : 'text-left'} ${i < colCount - 1 ? 'border-r border-gray-200' : ''}`}>
                  {columnHeaderLabel(h)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => {
            const section = sections[i] || '';
            const prevSection = i > 0 ? (sections[i - 1] || '') : '';
            const showDivider = section !== '' && section !== prevSection;
            const isSectionRow = showDivider && row[0]?.trim() === section;
            const isTotal = isTotalRow(row);

            return (
              <>
                {showDivider && !isSectionRow && (
                  <tr key={`sec-${i}`} class="bg-ps-yellow-50 border-t-2 border-ps-yellow-200">
                    <td colSpan={colCount} class="px-3 py-1.5 text-xs font-semibold text-ps-yellow-800 uppercase tracking-wide">
                      {section}
                    </td>
                  </tr>
                )}
                <tr key={i} class={
                  isSectionRow
                    ? 'bg-ps-yellow-50 border-t-2 border-ps-yellow-200 font-semibold text-ps-yellow-900'
                    : isTotal
                      ? 'bg-gray-100 border-t-2 border-gray-300 font-semibold text-gray-900'
                      : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                }>
                  {row.map((cell, j) => (
                    <td key={j} class={`px-3 py-1.5 border-b border-gray-100 whitespace-nowrap ${numSet.has(j) ? 'text-right tabular-nums' : ''} ${j < colCount - 1 ? 'border-r border-gray-200' : ''}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
