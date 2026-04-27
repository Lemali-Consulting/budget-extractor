/**Functional grouping of operating-budget departments for the Money Flow
 * Sankey. Each department maps to one of six categories; each category has
 * a color distinct from the revenue-side palette so flows don't collide
 * visually across the trunk. */

export type DepartmentGroup =
  | 'Public Safety'
  | 'Public Works & Infrastructure'
  | 'Parks & Quality of Life'
  | 'Finance & Administration'
  | 'Governance & Legal'
  | 'Planning & Services';

export const GROUP_COLORS: Record<DepartmentGroup, string> = {
  'Public Safety': '#9f1239',                 // rose-800
  'Public Works & Infrastructure': '#ea580c', // orange-600
  'Parks & Quality of Life': '#15803d',       // green-700
  'Finance & Administration': '#4338ca',      // indigo-700
  'Governance & Legal': '#a21caf',            // fuchsia-700
  'Planning & Services': '#0d9488',           // teal-600
};

const SLUG_TO_GROUP: Record<string, DepartmentGroup> = {
  // Public Safety
  'bureau-of-police': 'Public Safety',
  'bureau-of-fire': 'Public Safety',
  'bureau-of-emergency-medical-services': 'Public Safety',
  'bureau-of-administration-public-safety': 'Public Safety',
  'citizen-police-review-board': 'Public Safety',
  'office-of-municipal-investigations': 'Public Safety',
  'bureau-of-animal-care-and-control': 'Public Safety',
  'stop-the-violence-trust-fund': 'Public Safety',
  'police-secondary-employment-trust-fund': 'Public Safety',

  // Public Works & Infrastructure
  'bureau-of-operations': 'Public Works & Infrastructure',
  'bureau-of-administration-public-works': 'Public Works & Infrastructure',
  'bureau-of-environmental-services': 'Public Works & Infrastructure',
  'bureau-of-facilities': 'Public Works & Infrastructure',
  'department-of-mobility-and-infrastructure': 'Public Works & Infrastructure',
  'liquid-fuels-trust-fund': 'Public Works & Infrastructure',
  'regional-asset-district-public-works-trust-fund': 'Public Works & Infrastructure',
  'public-works-trust-fund': 'Public Works & Infrastructure',
  'shade-tree-trust-fund': 'Public Works & Infrastructure',

  // Parks & Quality of Life
  'department-of-parks-and-recreation': 'Parks & Quality of Life',
  'parks-tax-trust-fund': 'Parks & Quality of Life',
  'regional-asset-district-parks-and-recreation-trust-fund': 'Parks & Quality of Life',
  'frick-park-trust-fund': 'Parks & Quality of Life',
  'mellon-park-trust-fund': 'Parks & Quality of Life',
  'schenley-park-rink-trust-fund': 'Parks & Quality of Life',
  'special-events-trust-fund': 'Parks & Quality of Life',
  'special-food-service-trust-fund': 'Parks & Quality of Life',
  'senior-citizens-program-trust-fund': 'Parks & Quality of Life',

  // Finance & Administration
  'department-of-finance': 'Finance & Administration',
  'department-of-human-resources-and-civil-service': 'Finance & Administration',
  'office-of-management-and-budget': 'Finance & Administration',
  'department-of-innovation-and-performance': 'Finance & Administration',
  'office-of-the-city-controller': 'Finance & Administration',
  'three-taxing-bodies-trust-fund': 'Finance & Administration',
  'pittsburgh-partnership-trust-fund': 'Finance & Administration',
  'community-development-trust-fund': 'Finance & Administration',
  'appendices': 'Finance & Administration',

  // Governance & Legal
  'office-of-the-mayor': 'Governance & Legal',
  'city-council': 'Governance & Legal',
  'office-of-the-city-clerk': 'Governance & Legal',
  'department-of-law': 'Governance & Legal',
  'ethics-hearing-board': 'Governance & Legal',
  'commission-on-human-relations': 'Governance & Legal',

  // Planning & Services
  'department-of-city-planning': 'Planning & Services',
  'department-of-permits-licenses-and-inspections': 'Planning & Services',
  'office-of-community-health-and-safety': 'Planning & Services',
  'eeoc-trust-fund': 'Planning & Services',
  'hud-fair-housing-program-trust-fund': 'Planning & Services',
};

export function groupForSlug(slug: string): DepartmentGroup | null {
  return SLUG_TO_GROUP[slug] ?? null;
}

export function colorForSlug(slug: string): string {
  const group = groupForSlug(slug);
  return group ? GROUP_COLORS[group] : '#94a3b8';
}
