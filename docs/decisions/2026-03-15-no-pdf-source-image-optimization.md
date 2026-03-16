# No PDF Source Image Optimization

**Date:** 2026-03-15
**Status:** accepted

## Context

The source budget PDFs (operating: 27 MB, capital: 35 MB) are ~95% embedded JPEG photos by weight. We investigated whether these could be losslessly reduced to save storage and speed up processing.

## Decision

Leave the source PDFs as-is. The embedded images are already JPEG-compressed (DCTDecode) by the City of Pittsburgh's publishing tool, and there is no meaningful lossless size reduction available. Our pipeline already renders page images and chart crops to WebP (quality 80) for the web app, which is the only place image size matters to us.

## Alternatives Considered

- **Re-encode JPEGs at lower quality**: Would reduce size but is lossy and modifies source-of-truth inputs
- **Downsample embedded images**: Same concern — alters source documents we don't control
- **Strip metadata / linearize PDFs**: Saves only a few KB on files dominated by image data
- **Convert to WebP/JBIG2 inside the PDF**: Breaks PDF compatibility and alters source inputs

## Consequences

- Source PDFs remain at their original size (~62 MB combined)
- No risk of degrading extractor accuracy from modified inputs
- Web-facing images are already optimized via the existing WebP pipeline
