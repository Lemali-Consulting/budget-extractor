# PDF vs Image Input for Claude Vision

## Images (PNG/JPG) generally produce better results

- Claude's vision model can "see" the full visual layout — lines, spacing, alignment, shading
- Better at understanding spatial relationships in tables
- Colored bands, horizontal rules, and column alignment are visually obvious

## PDFs lose layout information

- Claude can read PDF text content, but loses much of the visual layout information
- Table structure often depends on whitespace positioning that doesn't translate well
- Multi-column layouts can get linearized incorrectly

## Recommendation

If using an OCR/vision-based approach, render PDF pages to high-resolution PNGs first and send those to Claude rather than sending raw PDF pages.

## Note on this project

The spatial table extractor (`utils/spatial_table_extractor.py`) bypasses Claude entirely — it uses pdfplumber's word-position data (x/y coordinates) to reconstruct tables programmatically, which is more reliable and reproducible than sending pages to an LLM. The `render_images=True` option generates PNGs for human visual inspection during debugging, not for LLM consumption.
