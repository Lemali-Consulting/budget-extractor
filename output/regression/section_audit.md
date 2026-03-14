# Section Audit: Manual Judgment + Automated Detection Reconciliation

Which CSVs contain internal sections (category headers, program groups, subtotals)?

## Detection patterns

The automated detector (`scripts/detect_sections.py`) uses four patterns:

1. **category_code**: `^\d{2} - UPPERCASE` (e.g., "51 - PERSONNEL-SALARIES & WAGES")
   — 385 occurrences across all CSVs
2. **text_only_header**: First cell has text, all other columns empty
   — 165 occurrences
3. **bureau_dept_header**: Matches "Bureau of/Department of/Office of" with rest empty
   — 18 occurrences
4. **allcaps_label**: All-caps text with rest empty (e.g., "EXPENDITURES", "REVENUES")
   — 8 occurrences

**Result: 117 of 298 CSVs have at least one detected section.**

## CSVs WITH sections

### Type A: Expense/Revenue category headers (`XX - CATEGORY NAME`)
These tables have rows like `51 - PERSONNEL-SALARIES & WAGES` that serve as
section headers, followed by detail rows like `51101 - Regular`. The header
rows carry subtotals in the numeric columns.

Confirmed by both manual review and automated detection across:
- **Revenue Detail** (07): P0T0, P1T0, P2T0
- **Expenditures Detail** (09): P0T0, P1T0, P2T0
- **All department subclass detail tables** (the "XX - CATEGORY" pattern):
  10/P3T0, 10/P4T0, 11/P3T0, 11/P4T0, 12/P3T0, 12/P4T0, 13/P6T0, 13/P7T0,
  14/P5T0, 14/P6T0, 15/P4T0, 15/P5T0, 17/P6T0, 17/P7T0, 17/P8T0,
  18/P4T0, 18/P5T0, 19/P4T0, 19/P5T0, 20/P4T0, 20/P5T0, 21/P6T0, 21/P7T0, 21/P8T0,
  25/P5T0, 25/P6T0, 25/P7T0, 26/P7T0, 26/P8T0, 26/P9T0,
  27/P4T0, 27/P5T0, 27/P6T0, 28/P4T0, 28/P5T0, 29/P4T0, 29/P5T0,
  31/P2T0, 31/P3T0, 32/P3T0, 32/P4T0, 32/P5T0, 33/P2T0, 33/P3T0,
  34/P3T0, 34/P4T0, 34/P5T0, 36/P9T0, 36/P10T0, 37/P5T0, 37/P6T0
- **Trust fund detail tables**: 38/P1T1, 39/P0T1, 40/P0T1, 41/P0T1,
  42/P0T1, 43/P0T1, 44/P1T1, 47/P0T1, 48/P0T1, 50/P0T1, 51/P1T1,
  52/P0T1, 53/P0T1, 54/P0T1, 55/P0T1, 56/P0T1

### Type B: Program/division group headers (text-only labels)
Personnel tables where a text-only row names a program or division.

| CSV | Sections detected |
|-----|-------------------|
| 14_Department_of_Innovation_and_Performance/P3T0 | I&P Administration, IT Operations Reliability, Security & Risk, Operations Performance Excellence, Business Technology |
| 14_Department_of_Innovation_and_Performance/P4T0 | Communications |
| 17_Department_of_Finance/P4T0 | Administration & Treasury Division, Business Intelligence, Cash Management, Tax Compliance Division, Real Estate Division |
| 31_Bureau_of_Administration_Public_Works/P1T0 | Director's Office, Office of Personnel & Finance, Administration, Inspections |
| 32_Bureau_of_Operations/P1T0 | Administration, Office of Personnel & Finance, Streets Maintenance, Parks Maintenance, Forestry, Heavy Equipment |
| 33_Bureau_of_Environmental_Services/P1T0 | Environmental Services, Administration, Office of Personnel & Administration |
| 34_Bureau_of_Facilities/P1T0 | Director's Office, Facilities Maintenance, Construction, Architecture, Office of Personnel & Finance, Administration |
| 44_Stop_the_Violence_Trust_Fund/P2T0 | Community Health and Safety, Operations, ROOTS Program, Continuum of Support Program, Crisis Response Program, PINS Program, Community Resilience Program, LEAD |
| 44_Stop_the_Violence_Trust_Fund/P3T0 | "CitiSports, Department of Parks and Recreation" |

### Type C: Top-level fiscal sections
| CSV | Sections detected |
|-----|-------------------|
| 04_Five-Year_Financial_Forecast/P1T0 | EXPENDITURES, BEGINNING RESERVE FUND, FUND BALANCE AS A % OF, DEBT SERVICE AS A % OF |

### Type D: Bureau/department headers (fee schedules)
| CSV | Sections detected |
|-----|-------------------|
| 63_Master_Fee_Schedule/P1T0 | BUREAU OF FIRE |
| 63_Master_Fee_Schedule/P3T0 | DEPARTMENT OF CITY PLANNING |
| 63_Master_Fee_Schedule/P3T1 | DEPARTMENT OF MOBILITY & INFRASTRUCTURE + subsections |
| 63_Master_Fee_Schedule/P7T0 | Bureau of Administration, Bureau of EMS, Bureau of Police, Bureau of Fire |
| 63_Master_Fee_Schedule/P9T0 | (via P9T1) POOL PASSES, TENNIS, SKATING RINKS + farmer's markets |
| 63_Master_Fee_Schedule/P11T0 | DEPARTMENT OF PERMITS, LICENSES, AND INSPECTIONS + subsections |
| 63_Master_Fee_Schedule/P14T0 | DEPARTMENT OF PUBLIC WORKS + YEAR ROUND INDOOR SHELTERS, OPEN AIR SHELTERS, OTHER |
| 63_Master_Fee_Schedule/P16T0 | DEPARTMENT OF FINANCE + Film Permit Fees, Fines |
| 63_Master_Fee_Schedule/P19T0 | OFFICE OF MANAGEMENT & BUDGET |
| 63_Master_Fee_Schedule/P20T0 | BUREAU OF EMS + OneStopPGH |
| 63_Master_Fee_Schedule/P21T2 | Towing |

### Type E: "Temporary, Part-Time, and Seasonal Allowances" labels
These appear in personnel tables as a text-only row. Detected as text_only_header.
Present in: 10/P2T1, 12/P2T1, 13/P4T1, 14/P4T1, 15/P3T1, 17/P4T1, 18/P3T1,
19/P3T1, 21/P4T1, 26/P5T1, 27/P3T1, 31/P1T1, 32/P1T1, 33/P1T1, 36/P7T1,
37/P4T1, 50/P1T1, 51/P2T1, 52/P1T1, 54/P1T1, 55/P1T1

### Type F: "Revenues" / "Expenditures" labels in trust fund detail tables
Trust fund tables with combined revenue+expenditure detail have "Revenues" and
"Expenditures" as section labels. These separate the revenue and expense parts.
Present in: 38/P1T1, 39/P0T1, 41/P0T1, 42/P0T1, 43/P0T1, 44/P1T1, 47/P0T1,
48/P0T1, 50/P0T1, 51/P1T1, 52/P0T1, 53/P0T1, 54/P0T1, 55/P0T1, 56/P0T1

## Reconciliation: Detection vs. Manual Judgment

### False positives fixed (v2)
- **61_Debt_Service/P10T0-P14T0**: Dates like "3/1/2026" in first row with empty
  columns were misdetected as text_only_header. Fixed by adding DATE_RE filter.
- **04_Five-Year_Financial_Forecast/P1T0**: "Transfer to Early Childhood" and
  "Transfer to Housing" are budget line items with zero appropriation, not section
  headers. Fixed by adding TRANSFER_RE filter.

### False negatives fixed (v2)
- **63_Master_Fee_Schedule/P1T0, P3T0, P3T1, P11T0, P14T0, P16T0, P19T0, P20T0**:
  Bureau/department headers at CSV row 2 (between coordinate row and column names)
  were skipped because the detector assumed row 2 is always the column name row.
  Fixed by checking if the "column name" row matches BUREAU_DEPT_RE.

### Items my manual judgment missed
The automated detector found many more sectioned CSVs than my manual review caught:
- All the **trust fund detail tables** with Revenue/Expenditure sections
- The **"Temporary, Part-Time" labels** across ~20 personnel tables
- Several **department personnel tables with division groupings** (14, 17, 31-34)
- The per-department **5-year summary tables** (e.g., 10/P4T0, 11/P4T0) which have
  compact category_code headers

### Remaining edge cases (acceptable)
- **"Expenditures" as a standalone row** in subclass detail tables: Detected as
  text_only_header. This is technically a table-level label rather than a section
  divider, but harmless to include — it will become the section name for the first
  block of detail rows, which is correct.
- **"REVENUES" not detected in 04/P1T0**: The word "REVENUES" appears in the column
  header row, not as a standalone data row, so it's correctly not detected. The
  table's revenue section has no explicit label row — it's just the first block
  before "EXPENDITURES".

## CSVs WITHOUT sections (184 of 298)

All flat tables: salary step grids (60), debt service schedules (61), pension (62),
grants listings (58), single-line trust fund balances, simple personnel lists,
hourly rate tables, appendix equipment lists, and department summaries (04/P2T0).
