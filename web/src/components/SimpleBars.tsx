/**Minimal horizontal bar chart — no axes, just bars with labels and values.*/

interface BarItem {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  items: BarItem[];
  /** Format preset: 'dollar' (default) or 'fte' */
  format?: 'dollar' | 'fte';
  maxItems?: number;
}

function formatDollar(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatFte(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} FTE`;
}

export default function SimpleBars({ items, format = 'dollar', maxItems = 8 }: Props) {
  const formatter = format === 'fte' ? formatFte : formatDollar;
  const display = items.slice(0, maxItems);
  const maxVal = Math.max(...display.map((d) => Math.abs(d.value)));

  return (
    <div class="space-y-2">
      {display.map((item) => {
        const pct = maxVal > 0 ? (Math.abs(item.value) / maxVal) * 100 : 0;
        return (
          <div>
            <div class="flex items-center justify-between text-sm mb-0.5">
              <span class="text-gray-700 truncate mr-2">{item.label}</span>
              <span class="text-gray-900 font-medium tabular-nums whitespace-nowrap">{formatter(item.value)}</span>
            </div>
            <div class="h-5 bg-gray-100 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.color || '#2563eb',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
