/**Large-number display for key budget statistics.*/

interface Props {
  label: string;
  value: string;
  detail?: string;
  color?: string;
}

export default function HeroStat({ label, value, detail, color = 'text-blue-900' }: Props) {
  return (
    <div class="text-center">
      <div class="text-sm text-gray-500 mb-1">{label}</div>
      <div class={`text-3xl md:text-4xl font-bold ${color}`}>{value}</div>
      {detail && <div class="text-sm text-gray-500 mt-1">{detail}</div>}
    </div>
  );
}
