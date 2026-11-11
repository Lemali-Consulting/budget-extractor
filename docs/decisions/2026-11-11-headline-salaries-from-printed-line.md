# Headline personnel figure is the printed salaries-and-wages line

**Date:** 2026-11-11
**Status:** accepted

## Context

The home page and dashboard personnel cards showed our sum of every department's "Total Full-Time Positions and Net Salaries" line ($281.3M for 2027 after the payroll fix). That figure includes trust-fund positions and leaves out overtime and premium pay. Public Source's fact-checkers compare the site against the budget document. Max raised a concern that this scope is "less intuitive than the one that is mentioned straight up on the Operating Budget page". That figure is the General Fund's "51 - Personnel-Salaries & Wages" line, $328,169,672, printed in the Expenditure Summary (p. 45) and the Expenditures Detail (p. 51).

## Decision

Approved by Max on 2026-11-11 ("yes, go ahead and deploy to the preview"):

- The personnel card headlines the printed General Fund salaries-and-wages line. It shows the change against the prior budget and links to the page it is printed on. `build_web_data.py` reads this line from the Expenditure Summary into `views/{prefix}salaries-and-wages.json`.
- The card's FTE count covers General Fund departments only, to match the scope of the salaries line. The card labels it as our count, because the document prints no citywide FTE total.
- Department, position and treemap views keep the position-table figures. The personnel page says these are budgeted positions net of vacancies, with trust funds included. It also explains why they don't add up to the citywide line: overtime and premium pay are budgeted only citywide.

## Alternatives considered

- **Keep the $281.3M net-salaries sum on the card, with its scope spelled out.** Rejected: no reader can find that number in the PDF, and it doesn't match the figure the Operating Budget section prints.
- **Add the per-department 51 lines from the trust-fund sections to the citywide line.** Rejected: the result would be another figure the document never prints.
