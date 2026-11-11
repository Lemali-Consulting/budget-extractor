/**Functional grouping of operating-budget departments for the Money Flow
 * Sankey. Each department maps to one of six categories; each category has
 * a color distinct from the revenue-side palette so flows don't collide
 * visually across the trunk. */

export type DepartmentGroup =
  | 'Public safety'
  | 'Public works & infrastructure'
  | 'Parks & quality of life'
  | 'Finance & administration'
  | 'Governance & legal'
  | 'Planning & services';

export const GROUP_COLORS: Record<DepartmentGroup, string> = {
  'Public safety': '#9f1239',                 // rose-800
  'Public works & infrastructure': '#ea580c', // orange-600
  'Parks & quality of life': '#15803d',       // green-700
  'Finance & administration': '#4338ca',      // indigo-700
  'Governance & legal': '#a21caf',            // fuchsia-700
  'Planning & services': '#0d9488',           // teal-600
};

const SLUG_TO_GROUP: Record<string, DepartmentGroup> = {
  // Public Safety
  'bureau-of-police': 'Public safety',
  'bureau-of-fire': 'Public safety',
  'bureau-of-emergency-medical-services': 'Public safety',
  'bureau-of-administration-public-safety': 'Public safety',
  'citizen-police-review-board': 'Public safety',
  'office-of-municipal-investigations': 'Public safety',
  'bureau-of-animal-care-and-control': 'Public safety',
  'stop-the-violence-trust-fund': 'Public safety',
  'police-secondary-employment-trust-fund': 'Public safety',

  // Public Works & Infrastructure
  'bureau-of-operations': 'Public works & infrastructure',
  'bureau-of-administration-public-works': 'Public works & infrastructure',
  'bureau-of-environmental-services': 'Public works & infrastructure',
  'bureau-of-facilities': 'Public works & infrastructure',
  'department-of-mobility-and-infrastructure': 'Public works & infrastructure',
  'liquid-fuels-trust-fund': 'Public works & infrastructure',
  'regional-asset-district-public-works-trust-fund': 'Public works & infrastructure',
  'public-works-trust-fund': 'Public works & infrastructure',
  'shade-tree-trust-fund': 'Public works & infrastructure',

  // Parks & Quality of Life
  'department-of-parks-and-recreation': 'Parks & quality of life',
  'parks-tax-trust-fund': 'Parks & quality of life',
  'regional-asset-district-parks-and-recreation-trust-fund': 'Parks & quality of life',
  'frick-park-trust-fund': 'Parks & quality of life',
  'mellon-park-trust-fund': 'Parks & quality of life',
  'schenley-park-rink-trust-fund': 'Parks & quality of life',
  'special-events-trust-fund': 'Parks & quality of life',
  'special-food-service-trust-fund': 'Parks & quality of life',
  'senior-citizens-program-trust-fund': 'Parks & quality of life',

  // Finance & administration
  'department-of-finance': 'Finance & administration',
  'department-of-human-resources-and-civil-service': 'Finance & administration',
  'office-of-management-and-budget': 'Finance & administration',
  'department-of-innovation-and-performance': 'Finance & administration',
  'office-of-the-city-controller': 'Finance & administration',
  'three-taxing-bodies-trust-fund': 'Finance & administration',
  'pittsburgh-partnership-trust-fund': 'Finance & administration',
  'community-development-trust-fund': 'Finance & administration',
  'appendices': 'Finance & administration',

  // Governance & legal
  'office-of-the-mayor': 'Governance & legal',
  'city-council': 'Governance & legal',
  'office-of-the-city-clerk': 'Governance & legal',
  'department-of-law': 'Governance & legal',
  'ethics-hearing-board': 'Governance & legal',
  'commission-on-human-relations': 'Governance & legal',

  // Planning & services
  'department-of-city-planning': 'Planning & services',
  'department-of-permits-licenses-and-inspections': 'Planning & services',
  'office-of-community-health-and-safety': 'Planning & services',
  'eeoc-trust-fund': 'Planning & services',
  'hud-fair-housing-program-trust-fund': 'Planning & services',
};

export function groupForSlug(slug: string): DepartmentGroup | null {
  return SLUG_TO_GROUP[slug] ?? null;
}

export function colorForSlug(slug: string): string {
  const group = groupForSlug(slug);
  return group ? GROUP_COLORS[group] : '#94a3b8';
}
