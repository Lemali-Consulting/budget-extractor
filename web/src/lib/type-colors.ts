/**Shared table type badge color classes and human-readable labels.*/

export const TYPE_COLORS: Record<string, string> = {
  personnel: 'bg-purple-100 text-purple-700',
  financial: 'bg-green-100 text-green-700',
  financial_summary: 'bg-emerald-100 text-emerald-700',
  revenue: 'bg-ps-blue-100 text-ps-blue-700',
  forecast: 'bg-sky-100 text-sky-700',
  grant: 'bg-ps-yellow-100 text-ps-yellow-700',
  debt_service: 'bg-ps-red-100 text-ps-red-700',
  fund_balance: 'bg-indigo-100 text-indigo-700',
  allocation: 'bg-cyan-100 text-cyan-700',
  salary: 'bg-violet-100 text-violet-700',
  fee_schedule: 'bg-lime-100 text-lime-700',
  cip_funding: 'bg-orange-100 text-orange-700',
  deliverables: 'bg-teal-100 text-teal-700',
  capital_summary: 'bg-yellow-100 text-yellow-700',
  capital_project: 'bg-rose-100 text-rose-700',
  glossary: 'bg-fuchsia-100 text-fuchsia-700',
  unknown: 'bg-gray-100 text-gray-600',
};

export const TYPE_LABELS: Record<string, string> = {
  personnel: 'Personnel',
  financial: 'Financial',
  financial_summary: 'Financial summary',
  revenue: 'Revenue',
  forecast: 'Forecast',
  grant: 'Grant',
  debt_service: 'Debt service',
  fund_balance: 'Fund balance',
  allocation: 'Allocation',
  salary: 'Salary',
  fee_schedule: 'Fee schedule',
  cip_funding: 'CIP funding',
  deliverables: 'Deliverables',
  capital_summary: 'Capital summary',
  capital_project: 'Capital project',
  glossary: 'Glossary',
  unknown: 'Unknown',
};

export const TYPE_DESCRIPTIONS: Record<string, string> = {
  personnel: 'Lists authorized positions with FTE counts and pay grades.',
  financial: 'Shows planned spending by budget category.',
  financial_summary: 'Compares actual, budgeted, and proposed spending across fiscal years.',
  revenue: 'Shows projected revenue by source.',
  forecast: 'Projects budget figures across multiple future years.',
  grant: 'Lists grants received with funding sources and amounts.',
  debt_service: 'Shows principal, interest, and total debt payments.',
  fund_balance: 'Projects beginning and ending fund balances.',
  allocation: 'Shows how funds are distributed across programs or uses.',
  salary: 'Lists pay grades, steps, and rate schedules.',
  fee_schedule: 'Lists fees charged for city services.',
  cip_funding: 'Shows capital project funding by source and year.',
  deliverables: 'Lists project objectives, deliverables, and performance measures.',
  capital_summary: 'Summarizes capital spending across projects or functional areas.',
  capital_project: 'Details individual capital project costs and timelines.',
  glossary: 'Defines budget terms, codes, and abbreviations.',
  unknown: 'Budget data table.',
};

export function typeDescription(type: string): string {
  return TYPE_DESCRIPTIONS[type] || TYPE_DESCRIPTIONS.unknown;
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function typeColor(type: string): string {
  return TYPE_COLORS[type] || TYPE_COLORS.unknown;
}
