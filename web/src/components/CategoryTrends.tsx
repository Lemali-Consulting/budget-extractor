/**Selectable revenue-by-category view: a category picker above a TrendsChart.*/

import { useState } from 'preact/hooks';
import TrendsChart from './TrendsChart';
import type { TrendSeries } from '../lib/longitudinal';

export interface CategorySeries {
  category: string;
  series: TrendSeries;
}

interface Props {
  categories: CategorySeries[];
}

export default function CategoryTrends({ categories }: Props) {
  const [selected, setSelected] = useState<string>(categories[0]?.category ?? '');
  const current = categories.find((c) => c.category === selected) ?? categories[0];
  if (!current) {
    return <div class="text-gray-400 italic py-4">No category data available.</div>;
  }

  return (
    <div>
      <div class="flex flex-wrap gap-2 mb-4" role="group" aria-label="Revenue category">
        {categories.map((c) => (
          <button
            type="button"
            aria-pressed={c.category === current.category}
            class={`px-3 py-1.5 rounded-full text-sm border transition ${
              c.category === current.category
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
            }`}
            onClick={() => setSelected(c.category)}
          >
            {c.category}
          </button>
        ))}
      </div>
      <TrendsChart series={current.series} ariaLabel={`${current.category} revenue over time`} />
    </div>
  );
}
