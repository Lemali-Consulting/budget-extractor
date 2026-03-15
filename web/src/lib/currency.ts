/**Shared currency parsing and formatting utilities.*/

export function parseCurrency(s: string): number | null {
  if (!s || s === '—' || s === 'varies') return null;
  const neg = s.includes('(') && s.includes(')');
  const cleaned = s.replace(/[$,()]/g, '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return neg ? -num : num;
}

export function formatDollar(d: number): string {
  const abs = Math.abs(d);
  if (abs >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(d / 1_000).toFixed(0)}K`;
  return `$${d}`;
}
