# Show the budget per position on position lines

**Date:** 2026-11-12
**Status:** accepted

## Context

The PDF's position tables print one budget per line: the headcount on the line times its pay. For example, the Bureau of Administration (Public Safety) budgets 6 Violence Prevention Specialists at $511,306.

Rich, the fact-checker, asked via Max whether the site could say "$85K each" instead:

> "I'd rather not make the reader do the math to figure out the per-position pay." — Rich, via Max, 2026-11-12

We found the division accurate, with three limits:
- It's an **average**. A grade such as 24G has pay steps.
- It isn't the printed rate. Where the rate column gives a dollar salary, the budget runs about 1–3% above headcount × rate.
- It **doesn't hold for fractional headcounts**. These lines are part-time, or the position is split between two funds: the PDF marks split titles with "*" and prints the percentages at the page foot (e.g. Senior Assistant, Real Estate, 25% Finance / 75% Three Taxing Bodies Trust Fund).

Max was given three options: replace the line total, put the figure beside it, or add a column. Max chose a separate column (2026-11-12), on both the department pages and the personnel explorer.

## Decision

- **Department pages:** the "Top positions by budget" table gains a "Per position" column, after the 2027 and 2026 budget columns. The table's cell padding narrows at phone width so the five columns fit without sideways scrolling.
- **Personnel explorer:** it gains a sortable "Per position" column, after "2027 budget". It's shown in whole dollars, like the budget column.
- **Rule:** the figure is the 2027 line budget divided by its 2027 headcount. It's shown only when the headcount is a whole number, and other lines get a dash. This was our call: fractional headcount covers every split-funded "*" line in the 2027 data, as well as the part-time lines, without relying on the asterisk, which the PDF never defines. Fire's whole-number starred lines (Deputy Chief*, Battalion Chief*) follow the usual budget ≈ headcount × rate pattern, so they keep the figure.
- The column is headed "Per position" rather than "Each" (our call).
- The line totals stay, so each table still matches the PDF.

## Consequences

- This is the site's own calculation, printed beside PDF figures. It is labelled only by its header, and the About page doesn't mention it.
- 164 rows across 36 department pages, and 225 explorer lines with more than one position, now show a figure that differs from their line total.
