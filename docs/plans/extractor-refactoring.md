# Refactoring Plan: `utils/spatial_table_extractor.py`

The spatial table extractor is ~2900 lines in a single file/class. This plan describes how to decompose it into focused modules while preserving the public API.

## Current structure

Everything lives in `SpatialTableExtractor` plus three dataclasses (`SpatialColumn`, `SpatialRow`, `SpatialTable`) and a helper `_variance()`.

## Proposed modules

All new modules go in `utils/`. The main `spatial_table_extractor.py` re-exports everything so existing imports continue to work.

### `utils/spatial_models.py` (~60 lines)
Dataclasses and small helpers.
- `SpatialColumn`, `SpatialRow`, `SpatialTable`
- `_variance()`

### `utils/spatial_columns.py` (~400 lines)
Column detection and refinement.
- `_detect_columns`
- `_find_dollar_separators`
- `_cluster_gap_positions`
- `_adjust_separators_to_word_boundaries`
- `_detect_column_alignment`
- `_word_in_column`

### `utils/spatial_rows.py` (~200 lines)
Row clustering and row-level transforms.
- `_cluster_rows`
- `_filter_prose_rows`
- `_merge_multiline_rows`
- `_filter_page_headers`

### `utils/spatial_headers.py` (~400 lines)
Header detection, merging, and propagation.
- `_merge_header_tables`
- `_is_header_table`
- `_extract_internal_headers`
- `_merge_group_headers`
- `_combine_header_rows`
- `_extract_header_separators`
- `_rebuild_columns_with_header_seps`
- `_split_known_merged_columns`
- `_nearest_column`

### `utils/spatial_borders.py` (~350 lines)
Bordered and grant table extraction (pdfplumber-native paths).
- `_has_simple_bordered_tables`
- `_extract_bordered_tables`
- `_is_grant_page`
- `_extract_grant_tables`

### `utils/spatial_splitting.py` (~250 lines)
Sub-table splitting and filtering.
- `_find_table_separators`
- `_find_background_bands`
- `_build_sub_regions`
- `_split_tables_at_mid_prose`, `_find_mid_prose_split`, `_do_split`
- `_is_real_table`
- `_strip_peripheral_captions`
- `_remove_empty_columns`, `_remove_empty_columns_with_headers`

### `utils/spatial_debug.py` (~200 lines)
Debug visualization and CSV output.
- `render_debug_pdf`
- `render_debug`
- `merge_continuation_tables`, `_columns_match`
- Color palettes (`_TABLE_COLORS`, `_BORDER_COLORS`)

### `utils/spatial_table_extractor.py` (~300 lines)
Orchestration only: `__init__`, `extract`, `extract_tables`, `_assign_cells`, `_split_straddling_words`. Imports and delegates to the other modules. Re-exports all public names for backward compatibility.

## Approach

Each extracted module exposes standalone functions (or a mixin class) that accept the necessary state explicitly (words, columns, config values) rather than relying on `self`. The main class calls these functions, passing its config.

Alternatively, use mixin classes that `SpatialTableExtractor` inherits from. This preserves the `self.y_tolerance` access pattern with less refactoring but couples the modules to the class interface.

**Recommended: standalone functions.** Easier to test in isolation and makes dependencies explicit.

## Migration steps

1. Extract `spatial_models.py` (dataclasses) — zero risk, no logic changes
2. Extract `spatial_debug.py` — isolated, only called at end of pipeline
3. Extract `spatial_borders.py` — self-contained code paths with clear entry points
4. Extract `spatial_rows.py` — used by many modules but has no downstream deps
5. Extract `spatial_columns.py` — depends on rows, depended on by headers
6. Extract `spatial_splitting.py` — depends on rows
7. Extract `spatial_headers.py` — depends on columns and rows
8. Update `spatial_table_extractor.py` to import and delegate
9. Run regression tests after each step

## What not to do

- Don't split by arbitrary line count
- Don't create one file per method
- Don't change the public API (`SpatialTableExtractor`, `SpatialTable.to_list()`)
- Don't refactor method signatures until after the file split is stable
