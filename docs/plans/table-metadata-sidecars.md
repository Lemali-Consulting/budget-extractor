# Table Metadata Sidecars

## Problem

Extracted tables (CSVs) lack contextual metadata — section name, absolute page number, table type, and page-level header text that gets filtered during extraction. This makes it harder to programmatically consume or cross-reference the data.

## Approach

Emit a `.meta.json` sidecar file alongside each CSV (e.g., `P2T0.meta.json` next to `P2T0.csv`). This keeps CSVs clean for data consumers while preserving provenance.

### Example sidecar

```json
{
  "section": "City Council",
  "section_number": 10,
  "relative_page": 2,
  "absolute_page": 61,
  "table_index": 0,
  "headers": ["Title", "2025 FTE", "Rate/ Grade", "Hours/ Months", "2025 Budget", "2026 FTE", "Rate/ Grade", "Hours/ Months", "2026 Budget"],
  "table_type": "personnel",
  "page_header_lines": ["City of Pittsburgh", "Operating Budget Detail"]
}
```

### Metadata fields

| Field | Source | Description |
|---|---|---|
| `section` | `sections.json` | Section title (e.g., "City Council") |
| `section_number` | `sections.json` / filename | Numeric section index |
| `relative_page` | Extractor (existing) | Page number within the split PDF |
| `absolute_page` | `sections.json` start_page + offset | Page number in the full budget PDF |
| `table_index` | Extractor (existing) | Table index on the page |
| `headers` | `SpatialTable.headers` | Detected column headers |
| `table_type` | Heuristic classification | e.g., "personnel", "financial_summary", "revenue_detail" |
| `page_header_lines` | Filtered page headers | Lines currently stripped during extraction |

### Table type classification heuristics

- Headers contain "FTE" and "Rate/Grade" → `personnel`
- Headers contain "Budget" and "Actual" → `financial_summary`
- Headers contain "Revenue" → `revenue_detail`
- Fallback → `unknown`

## Files to modify

1. **`utils/spatial_table_extractor.py`** — Add metadata fields to `SpatialTable`; capture filtered page headers instead of discarding; add method to emit `.meta.json` during `render_debug`.
2. **`scripts/test_regression.py`** — Ignore `.meta.json` files during CSV comparison (or optionally validate them).
3. **Workflow scripts that call the extractor** — Pass section info from `sections.json` (section name, number, absolute page offset) so it can be included in the metadata.
