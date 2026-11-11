/**
 * Display names for capital projects. The capital budget prints project names
 * in ALL CAPS, which can't be turned into Public Source's sentence case by
 * rule: "28TH STREET BRIDGE" is a named bridge, "STREET RESURFACING" is not.
 * Each name is therefore written out here, keyed by the name as printed.
 * A project missing from this list falls back to the generic rule, and the
 * smoke tests flag it so it can be added.
 */
import { sentenceCase } from './text-case';

export const CAPITAL_PROJECT_NAMES: Readonly<Record<string, string>> = {
  '28TH STREET BRIDGE (TIP)': '28th Street Bridge (TIP)',
  'BEAVER AVENUE TWO-WAY CONVERSION (TIP)': 'Beaver Avenue two-way conversion (TIP)',
  'BEDFORD DWELLINGS CHOICE NEIGHBORHOOD': 'Bedford Dwellings Choice Neighborhood',
  'BLOOMFIELD BRIDGE (TIP)': 'Bloomfield Bridge (TIP)',
  "BOB O'CONNOR GOLF COURSE": "Bob O'Connor Golf Course",
  'BRIDGE PRESERVATION AND RESTORATION FUND (TIP)': 'Bridge preservation and restoration fund (TIP)',
  'BRIDGE UPGRADES': 'Bridge upgrades',
  'CALERA STREET BRIDGE (TIP)': 'Calera Street Bridge (TIP)',
  'CALIFORNIA AVENUE BRIDGE (TIP)': 'California Avenue Bridge (TIP)',
  'CAPITAL EQUIPMENT ACQUISITION': 'Capital equipment acquisition',
  'CDBG ADMINISTRATION': 'CDBG administration',
  'CDBG PERSONNEL': 'CDBG personnel',
  'CHARLES ANDERSON BRIDGE (TIP)': 'Charles Anderson Bridge (TIP)',
  "CITY COUNCIL'S PUBLIC SERVICE GRANTS": "City Council's public service grants",
  'COMPLETE STREETS': 'Complete streets',
  'CORLEY STREET BRIDGE (TIP)': 'Corley Street Bridge (TIP)',
  'CORLISS STREET TUNNEL (TIP)': 'Corliss Street Tunnel (TIP)',
  'DESIGN, CONSTRUCTION, AND INSPECTION SERVICES': 'Design, construction, and inspection services',
  'EAST SYCAMORE STREET BRIDGE (TIP)': 'East Sycamore Street Bridge (TIP)',
  'ELIZABETH STREET BRIDGE (TIP)': 'Elizabeth Street Bridge (TIP)',
  'EMERGENCY SOLUTIONS GRANT': 'Emergency Solutions Grant',
  'FACILITY IMPROVEMENTS - CITY FACILITIES': 'Facility improvements - city facilities',
  'FACILITY IMPROVEMENTS - PUBLIC SAFETY FACILITIES': 'Facility improvements - public safety facilities',
  'FACILITY IMPROVEMENTS - RECREATION AND SENIOR CENTERS': 'Facility improvements - recreation and senior centers',
  'FACILITY IMPROVEMENTS - SPORT FACILITIES': 'Facility improvements - sport facilities',
  'FAIR HOUSING': 'Fair housing',
  'FLEX BEAM GUIDERAILS AND FENCING': 'Flex beam guiderails and fencing',
  'FLOOD CONTROL PROJECTS': 'Flood control projects',
  'FRANKSTOWN AVENUE SIGNAL IMPROVEMENTS (TIP)': 'Frankstown Avenue signal improvements (TIP)',
  'HERRON AVENUE BRIDGE (TIP)': 'Herron Avenue Bridge (TIP)',
  'HOME INVESTMENT PARTNERSHIPS PROGRAM': 'HOME Investment Partnerships Program',
  'HOUSING COUNSELING': 'Housing counseling',
  'HOUSING DEVELOPMENT': 'Housing development',
  'HOUSING OPPORTUNITIES FOR PERSONS WITH AIDS': 'Housing Opportunities for Persons With AIDS',
  'INFORMATION SYSTEMS MODERNIZATION': 'Information systems modernization',
  'LARIMER BRIDGE (TIP)': 'Larimer Bridge (TIP)',
  'LIBERTY AVENUE (HSIP)': 'Liberty Avenue (HSIP)',
  'MAJOR DEVELOPMENTS': 'Major developments',
  'MAPLE AVENUE BRIDGE (TIP)': 'Maple Avenue Bridge (TIP)',
  "MAYOR'S PUBLIC SERVICE GRANTS": "Mayor's public service grants",
  'MISSION STREET BRIDGE EAST (TIP)': 'Mission Street Bridge East (TIP)',
  'MISSION STREET BRIDGE WEST (TIP)': 'Mission Street Bridge West (TIP)',
  'MURRAY AVENUE (HSIP)': 'Murray Avenue (HSIP)',
  'NEIGHBORHOOD ECONOMIC DEVELOPMENT': 'Neighborhood economic development',
  'NEIGHBORHOOD EMPLOYMENT CENTERS': 'Neighborhood employment centers',
  'P.J. MCARDLE ROADWAY (TIP)': 'P.J. McArdle Roadway (TIP)',
  'P.J. MCARDLE ROADWAY BRIDGE OVER HILLSIDE (TIP)': 'P.J. McArdle Roadway bridge over Hillside (TIP)',
  'P.J. MCARDLE ROADWAY BRIDGE OVER SYCAMORE (TIP)': 'P.J. McArdle Roadway bridge over Sycamore (TIP)',
  'PARK RECONSTRUCTION': 'Park reconstruction',
  'PARK RECONSTRUCTION - REGIONAL ASSET DISTRICT PARKS': 'Park reconstruction - Regional Asset District parks',
  'PENN AVENUE RECONSTRUCTION, PHASE II (TIP)': 'Penn Avenue reconstruction, phase II (TIP)',
  'PENN AVENUE RECONSTRUCTION, PHASE III (TIP)': 'Penn Avenue reconstruction, phase III (TIP)',
  'PENN AVENUE SIGNAL IMPROVEMENTS (TIP)': 'Penn Avenue signal improvements (TIP)',
  'PITTSBURGH EMPLOYMENT PROGRAM': 'Pittsburgh employment program',
  'PLAY AREA IMPROVEMENTS': 'Play area improvements',
  'PUBLIC SAFETY EQUIPMENT': 'Public safety equipment',
  'PUBLIC SAFETY TRAINING FACILITY': 'Public safety training facility',
  'RAMP AND PUBLIC SIDEWALK': 'Ramp and public sidewalk',
  'REMEDIATION OF CONDEMNED BUILDINGS': 'Remediation of condemned buildings',
  'SENIOR COMMUNITY PROGRAM': 'Senior community program',
  'SLOPE FAILURE REMEDIATION': 'Slope failure remediation',
  'SMALL BUSINESS DEVELOPMENT': 'Small business development',
  'SMITHFIELD STREET (TIP)': 'Smithfield Street (TIP)',
  'SMITHFIELD STREET RECONSTRUCTION, PHASE II (TIP)': 'Smithfield Street reconstruction, phase II (TIP)',
  'SOUTH NEGLEY AVENUE BRIDGE (TIP)': 'South Negley Avenue Bridge (TIP)',
  'STEP REPAIR AND REPLACEMENT': 'Step repair and replacement',
  'STREET RESURFACING': 'Street resurfacing',
  'SWINBURNE BRIDGE (TIP)': 'Swinburne Bridge (TIP)',
  'SWINDELL BRIDGE (TIP)': 'Swindell Bridge (TIP)',
  'TRAIL DEVELOPMENT': 'Trail development',
  'URBAN REDEVELOPMENT AUTHORITY PERSONNEL': 'Urban Redevelopment Authority personnel',
  'WAR MEMORIALS AND PUBLIC ART': 'War memorials and public art',
  'WEST CARSON STREET BRIDGE (TIP)': 'West Carson Street Bridge (TIP)',
};

/** True when a printed name has a hand-written display name. */
export function hasCapitalProjectName(printed: string): boolean {
  return Object.hasOwn(CAPITAL_PROJECT_NAMES, printed.trim());
}

/** The name the site shows for a capital project printed as `printed`. */
export function capitalProjectName(printed: string): string {
  const key = printed.trim();
  return CAPITAL_PROJECT_NAMES[key] ?? sentenceCase(key);
}
