/**Tiny inline SVG sparkline for showing budget trends at a glance.*/

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export default function Sparkline({ values, width = 60, height = 20, color = '#046BD1' }: Props) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * innerW;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return `${x},${y}`;
    })
    .join(' ');

  // Endpoint for dot
  const lastX = pad + innerW;
  const lastY = pad + innerH - ((values[values.length - 1] - min) / range) * innerH;

  // Trend direction
  const trending = values[values.length - 1] >= values[0];

  return (
    <svg
      width={width}
      height={height}
      class="inline-block align-middle"
      style={{ minWidth: width }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={trending ? color : '#DC2725'}
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r="2"
        fill={trending ? color : '#DC2725'}
      />
    </svg>
  );
}
