# Bureau of Environmental Services: Source PDF Year Error

**Date:** 2026-03-15
**Status:** accepted

## Context

The cross-year comparison page shows Bureau of Environmental Services as "adopted only" — present in the 2026 document but missing from the 2025 document's data. Investigation revealed this is a printing error in the source PDF, not an extraction bug.

## Finding

The 2025 operating budget PDF (pages 215-217) has Bureau of Environmental Services with column headers one year behind every other department:

- **Position Summary** (P215): `2023 FTE | 2023 Budget | 2024 FTE | 2024 Budget` (should be 2024/2025)
- **Subclass Detail** (P216): `2022 Actual | 2023 Budget | 2024 Budget` (should be 2023/2024/2025)
- **Five Year Forecast** (P217): `2025 | 2026 | 2027 | 2028 | 2029` (correct)

Every other department in the 2025 document uses the correct year headers. The Five Year Forecast starting at 2025 confirms the subclass detail's "2024 Budget" column actually contains the 2025 budget ($19,541,701) — which matches the 2026 document's "2025 Budget" value for this department.

## Decision

Accept this as a known source data error. Do not add workarounds in the extractor or build pipeline for a single department's mislabeled columns. The cross-year comparison page correctly excludes this department since the column headers don't match.

## Consequences

- Bureau of Environmental Services appears as "adopted only" in cross-year comparison (1 of 40 departments)
- The department's data is still fully browsable in the section detail view — the table values are correct, only the year labels are wrong
- If Pittsburgh corrects this in a future PDF revision, the comparison will automatically pick it up
