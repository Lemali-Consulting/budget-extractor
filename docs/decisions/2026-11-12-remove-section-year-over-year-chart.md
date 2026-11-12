# Remove the year-over-year tab from section page charts

**Date:** 2026-11-12
**Status:** accepted

## Context

The chart panel on each section page had a "Year-over-year" tab. It charted the difference between the PDF's two latest year columns for every row. The PDF doesn't print those row-by-row changes, so the tab showed figures the site calculated rather than figures it reproduced. The client has cut every comparison of that kind so far, including the "What changed" page, the position-change lists and the FTE-change boxes. The tab also rendered badly. Its percentage labels sat half a row off from their bars, its axis printed "$-35.0M", and it was unreadable on phones. The finding is in `docs/notes/archive/2026-11-12-section-year-over-year-chart.md`.

## Decision

> "Remove the year-over-year tab" — Max, 2026-11-12

This answered a question that listed three options: remove the tab, keep it labeled as our calculation, or keep it as is. The panel now offers "Budget trend" and "Breakdown", which both plot the PDF's own figures. A smoke test checks that those are the only two tabs.

## Alternatives Considered

- **Keep it, labeled as our calculation.** Max didn't choose this. It would also have meant fixing the misplaced labels, the axis format and the phone layout first.
- **Keep it as is.** Max didn't choose this either.

## Consequences

- Section pages no longer show a change for each row. The PDF's own change figures, where it prints them, still appear in the reproduced tables.
- The chart code that drew the tab is deleted. Bringing it back would mean rewriting it with the rendering problems fixed.
