# Alternative Table Extraction Approaches

An analysis of general-purpose extraction strategies beyond what the spatial table extractor currently uses, and how they could help with remaining issues.

## Current approaches

1. **Spatial clustering** (main engine) — word positions → row clustering → gap-based column detection
2. **Bordered table passthrough** — delegates to pdfplumber's `find_tables()` for ruled/bordered tables
3. **Grant table extractor** — specialized hybrid for large bordered grant tables
4. **OCR fallback** — tesseract for image-based pages

## Approaches worth considering

### 1. Line/rule-based structure detection

We already use horizontal rules for sub-table splitting, but we could lean harder on **vertical rules** (even partial ones). Some budget PDFs have faint or partial vertical separators that pdfplumber's `find_tables()` misses but that `page.lines` or `page.rects` could reveal. Using detected vertical lines as column boundary *hints* (not hard constraints) could resolve issues like #4 and #5 where gap-based detection fails for narrow separations.

### 2. Header-anchored column detection (top-down)

The current flow is bottom-up: detect gaps across all rows, then match headers. An alternative is to detect column positions *primarily from headers*, since headers are reliably spaced and labeled. This would help when data rows have ambiguous gaps but headers are clear. We partially do this with header propagation, but making it the primary strategy for certain table types could be more robust.

### 3. Template matching / learned layouts

Since these are recurring annual budget documents with very stable formatting, we could define per-section templates (column count, approximate x-positions, expected headers) and match incoming pages against them. This is less "general purpose" but extremely robust for a known document set. It's essentially what the regression tests enforce implicitly — making it explicit would let us handle edge cases with confidence.

### 4. Camelot (lattice + stream modes)

[Camelot](https://camelot-py.readthedocs.io/) is a dedicated PDF table extraction library with two modes:

- **Lattice** — detects tables via intersecting lines (similar to pdfplumber's bordered detection but sometimes handles partial borders better)
- **Stream** — uses whitespace gaps similar to the spatial approach but with a different algorithm (text edge detection)

It could serve as a cross-check or fallback for pages where the extractor struggles. Worth trying on the remaining failing PDFs (45, 46, 49) to see if it gets them right.

### 5. Column type constraints

We could use *semantic knowledge* about column content to validate/correct column splits after initial detection. For example: if a column is expected to contain dollar amounts, verify all values match `\d[\d,]*(\.\d+)?`. If a "merged" cell contains two numbers that individually match expected types, auto-split it. This would directly address issues #2/#5 (merged FTE+rate, hours+budget).

## Recommendations

### High priority

**Column type constraints (#5)** gives the most bang-for-buck on remaining issues. We already know the column semantics from headers — using that to post-process and split incorrectly merged cells would fix issues #2 and #5 without changing the core detection logic.

**Header-anchored detection (#2)** is the next most useful — it would make the extractor more robust for the common case where headers are clean but data rows have ambiguous gaps.

### Lower priority

The others (Camelot, templates, partial-rule detection) are worth knowing about but less likely to move the needle given how well the spatial approach already works for 19+ PDFs.
