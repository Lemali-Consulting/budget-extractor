/**Consolidated visualization tab — lazy-loads chart components on first render.*/

import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import type { ComponentType } from 'preact';

type VizType = 'bar' | 'trend' | 'changes' | 'funding';

interface Props {
  headers: string[];
  rows: string[][];
  numericCols: number[];
  tableId: string;
  tableType: string;
  chartCol: number;
  onChartColChange: (col: number) => void;
}

const VIZ_LABELS: Record<VizType, string> = {
  bar: 'Bar Chart',
  trend: 'Trend',
  changes: 'Year Changes',
  funding: 'Funding Sources',
};

// Lazy-loaded component cache — shared across renders
const componentCache: Partial<Record<VizType, ComponentType<any>>> = {};

async function loadComponent(vizType: VizType): Promise<ComponentType<any>> {
  if (componentCache[vizType]) return componentCache[vizType]!;
  let mod: { default: ComponentType<any> };
  switch (vizType) {
    case 'bar':
      mod = await import('./ChartPanel');
      break;
    case 'trend':
      mod = await import('../TrendChart');
      break;
    case 'changes':
      mod = await import('../YearChangeChart');
      break;
    case 'funding':
      mod = await import('../FundingStackedBar');
      break;
  }
  componentCache[vizType] = mod.default;
  return mod.default;
}

export default function VizTab({ headers, rows, numericCols, tableId, tableType, chartCol, onChartColChange }: Props) {
  // Detect year columns
  const yearColCount = useMemo(() => {
    return numericCols.filter((i) => headers[i]?.match(/\b20\d{2}\b/)).length;
  }, [headers, numericCols]);

  // Available viz types for this table
  const available = useMemo((): VizType[] => {
    const types: VizType[] = [];
    if (yearColCount >= 3) types.push('trend');
    if (yearColCount >= 2) types.push('changes');
    if (numericCols.length > 0) types.push('bar');
    if (tableType === 'cip_funding') types.push('funding');
    return types;
  }, [numericCols, yearColCount, tableType]);

  const [vizType, setVizType] = useState<VizType>(() => available[0] || 'bar');
  const [LoadedComponent, setLoadedComponent] = useState<ComponentType<any> | null>(
    () => componentCache[available[0] || 'bar'] || null
  );
  const [loading, setLoading] = useState(!LoadedComponent);

  // Reset to first available if current selection isn't available (table changed)
  const activeViz = available.includes(vizType) ? vizType : available[0] || 'bar';

  // Load component when viz type changes
  useEffect(() => {
    if (available.length === 0) return;

    const cached = componentCache[activeViz];
    if (cached) {
      setLoadedComponent(() => cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    loadComponent(activeViz).then((comp) => {
      setLoadedComponent(() => comp);
      setLoading(false);
    });
  }, [activeViz]);

  // Preload next likely component on hover
  const preloadRef = useRef<VizType | null>(null);
  function handleHover(vt: VizType): void {
    if (preloadRef.current !== vt && !componentCache[vt]) {
      preloadRef.current = vt;
      loadComponent(vt);
    }
  }

  if (available.length === 0) {
    return <div class="text-gray-400 italic py-4">No numeric columns detected in this table.</div>;
  }

  // Build props for the active component
  const componentProps = activeViz === 'bar'
    ? { headers, rows, numericCols, chartCol, onChartColChange, tableId }
    : activeViz === 'funding'
      ? { headers, rows, tableId }
      : { headers, rows, numericCols, tableId };

  return (
    <div>
      {available.length > 1 && (
        <div class="flex items-center gap-1 mb-4">
          {available.map((vt) => (
            <button
              key={vt}
              class={`px-3 py-1.5 rounded text-sm font-medium transition ${
                activeViz === vt
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
              onClick={() => setVizType(vt)}
              onMouseEnter={() => handleHover(vt)}
            >
              {VIZ_LABELS[vt]}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div class="flex items-center justify-center py-12">
          <div class="text-sm text-gray-400">Loading chart...</div>
        </div>
      ) : LoadedComponent ? (
        <LoadedComponent {...componentProps} />
      ) : null}
    </div>
  );
}
