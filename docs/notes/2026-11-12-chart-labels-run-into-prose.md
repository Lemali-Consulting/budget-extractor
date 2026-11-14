# Chart labels run into the PDF's prose paragraphs

**Date:** 2026-11-12 (updated 2026-11-14)
**Status:** open (department pages fixed; citywide expenditure summary page 46 not)

On the citywide expenditure summary, a chart's values and legend still run into the paragraphs as if they were sentences. Department pages no longer show their subclass pie chart's title or labels: as of 2026-11-14 those are dropped as each year loads.

## Evidence

- `/sections/expenditure-summary/`, under "Fiscal year 2027 expenditures" (page 46 of the PDF): the paragraph ends "…represented by functional area in 2027. 2027 Spending by Division $6,578,891: 0.9% $119,917,152: 16.5% $6,859,771: 0.9% $36,435,488: 5.0% $89,948,128: 12.4%". The next paragraph opens "General Government Public Safety Finance Public Works Human Resources City Controller City Council General Government", which is the chart's legend, before the real text "General Government comprises 14 individual Departments…".
- The extractor gives these blocks the `narrative` role. Seen in the build of 2026-11-12 (local).

## Fixed on department pages (2026-11-14)

Public Source's fact-check flagged the department version as "goop" under the five-year forecast (Rich's factcheck sheet "1126", rows 24, 25, 30, 34–38, 40, 42, 43, 45, 46). Each department's forecast page prints a pie chart of 2027 spending by subclass. The site doesn't show that chart, and the extractor filed its title and labels as headings, prose or an "unknown" table.

The fix is a pattern, not an extractor change. A block or table made up only of the chart's title ("BUREAU OF POLICE 2027 Expenditures by Subclass") and capitalized subclass labels ("56 - SUPPLIES") is dropped. See `isSubclassChartLegend` in `web/src/lib/pdf-headings.ts`. `web/tests/pdf-scraps.spec.ts` checks every department page.

## Why the citywide case remains

The citywide legend ("General Government Public Safety Finance…") is a run of title-case names with no reliable pattern, so the department rule doesn't catch it. The fact-check's cut of the expenditure summary (row 19, item 2, "everything from 'Expenditures by subclass' down", 2026-11-14) starts on page 47, so it doesn't reach this paragraph on page 46. The fact-check didn't flag the paragraph either. Still on the built page as of 2026-11-14.

## Approaches for the citywide case

- Strip runs of "$amount: pct%" pairs out of paragraphs as each year loads. The legend run would still need its own handling.
- Fix it in the extractor: drop words that fall inside a detected chart region from the narrative blocks. This is more correct, but the regression baselines would need checking.
