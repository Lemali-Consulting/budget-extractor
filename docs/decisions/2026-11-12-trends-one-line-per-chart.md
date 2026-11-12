# Trends charts show one line: actuals plus the proposed 2027 budget

**Date:** 2026-11-12
**Status:** accepted

## Context

The trends page drew, on every chart, a dashed estimate, budget and forecast line for each budget document (2024 adopted, 2025, 2026 as amended, 2027 proposed) beside the actuals. It also listed 25 notes, 21 of them 2023 figures that later documents restated. Rich (Public Source) found it confusing:

> "the overlapping dotted-line projections doing more to confuse than to illuminate, plus the large number of notes needed at the bottom. I think we should either simplify or eliminate this page." — Rich, relayed by Max, 2026-11-12

## Decision

Max chose "one line per chart" from three options I laid out (remove the page; one line per chart; history plus 2027 only, no forecast). Each chart now shows the actuals and the proposed 2027 budget's own estimate, budget and five-year forecast.

The notes keep only what the charts show:
- where the expenditure actuals come from;
- the 2027 document's two 2026 expenditure estimates (the hollow diamond);
- what the blue line is.

The restatement notes and the other documents' conflict notes are gone, because their lines are no longer drawn. Rich's wording fixes went in at the same time: "proposed 2027 budget" word order, and "The 2027 forecast projects the reserve fund turning negative in 2031 and finishing the year at −$31.4M."

## Alternatives Considered

- **Remove the page.** Max didn't choose it. The site would have gone to 45 pages.
- **History plus 2027 only.** Max didn't choose it. It would have dropped the forecast years and the reserve callout about 2031.

## Consequences

- The page no longer shows how forecasts shifted from one document to the next, and it no longer discloses restated actuals. The longitudinal data still records both (`restatements`, `conflicts`), so either could be brought back.
- The data build is unchanged: `build_longitudinal.py` still reads every document, because older documents supply the actuals for 2022–2024.
