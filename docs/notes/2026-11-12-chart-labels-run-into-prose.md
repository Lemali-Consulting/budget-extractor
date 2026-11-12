# Chart labels run into the PDF's prose paragraphs

**Date:** 2026-11-12
**Status:** open

On some section pages, the text of a chart printed beside the prose is run into the paragraph as if it were a sentence. Headings no longer show chart text (see the house style section of `CLAUDE.md`), but paragraphs still do, and nothing on the site removes it yet.

## Evidence

- `/sections/expenditure-summary/`, under "Fiscal year 2027 expenditures" (page 46 of the PDF): the paragraph ends "…represented by functional area in 2027. 2027 Spending by Division $6,578,891: 0.9% $119,917,152: 16.5% $6,859,771: 0.9% $36,435,488: 5.0% $89,948,128: 12.4%". The next paragraph opens "General Government Public Safety Finance Public Works Human Resources City Controller City Council General Government", which is the chart's legend, before the real text "General Government comprises 14 individual Departments…".
- The extractor gives these blocks the `narrative` role, so the heading rules in `web/src/lib/pdf-headings.ts` never see them. Seen in the build of 2026-11-12 (local).

## Why it matters

A fact-checker reading the page sees dollar figures and percentages that aren't sentences, and a run of category names with no punctuation. The figures are the chart's own, so they're accurate, but they read as garbled text.

## Approaches

- Strip runs of "$amount: pct%" pairs, and legend-like runs of title-case names, out of paragraphs as each year loads. This is cheap, but the legend run has no reliable pattern.
- Fix it in the extractor: drop words that fall inside a detected chart region from the narrative blocks. This is more correct, and it needs the regression baselines checked.

Neither has been tried.
