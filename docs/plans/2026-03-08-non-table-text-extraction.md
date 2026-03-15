# Non-Table Text Extraction

Related: [table-metadata-sidecars.md](table-metadata-sidecars.md)

## Problem

The extractor currently identifies and discards three categories of non-table text:

1. **Page headers/footers** — "City of Pittsburgh", section titles like "Position Summary", page numbers
2. **Prose rows** — narrative paragraphs, bullet lists that appear above/below tables
3. **Mid-table prose** — footnotes that split a table in two

This text contains valuable context (department descriptions, budget justifications, footnotes) that should be searchable and linked to the relevant section/table.

## Approach: Per-page text manifest

For each page, emit a `P{n}.text.json` capturing all non-table text, ordered by vertical position, with each block linked to its context.

### Example output

```json
{
  "page_headers": ["City of Pittsburgh", "Operating Budget Detail", "City Council"],
  "section_title": "Position Summary",
  "blocks": [
    {
      "type": "narrative",
      "position": "before_table",
      "related_table": "P2T0",
      "y_range": [45.2, 112.8],
      "text": "The City Council is the legislative body of the City..."
    },
    {
      "type": "footnote",
      "position": "after_table",
      "related_table": "P2T0",
      "y_range": [580.1, 601.3],
      "text": "* Includes part-time and seasonal positions."
    }
  ]
}
```

### Block types

| Type | Source | Description |
|---|---|---|
| `narrative` | `_filter_prose_rows` leading prose | Paragraph text, bullet lists, descriptions |
| `footnote` | `_filter_prose_rows` trailing prose, `_split_tables_at_mid_prose` | Footnotes, annotations below or between tables |
| `page_header` | `_filter_page_headers` pattern matches | Repeated page-level headers (city name, budget year) |
| `section_title` | `_filter_page_headers` single-word rows above tables | Sub-section labels like "Position Summary" |

### Linking logic

Text blocks are linked to tables using y-position proximity:

- Text **above** a table's bbox → `before_table`, linked to the next table
- Text **below** a table's bbox → `after_table`, linked to the previous table
- Text **between** two tables → linked to the closer table by y-distance
- Page headers/section titles → page-level, not linked to a specific table

## Files to modify

1. **`utils/spatial_table_extractor.py`** — The `_filter_page_headers` and `_filter_prose_rows` methods already separate non-table text from table data. Change them to return the filtered text (with positions) rather than discarding it. Surface this through the extraction pipeline so `render_debug` can emit `.text.json` files.
2. **`scripts/test_regression.py`** — Ignore `.text.json` files during CSV comparison.
3. **Workflow scripts** — Optionally merge per-page text manifests with table metadata sidecars for a complete structured representation of each page.
