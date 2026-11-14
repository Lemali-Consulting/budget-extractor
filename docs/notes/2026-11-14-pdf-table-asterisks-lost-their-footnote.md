# Asterisked titles in some reproduced PDF tables no longer have their footnote

**Date:** 2026-11-14
**Status:** open

In the PDF's own position tables on three department pages, titles keep an asterisk ("Director*") whose explanation is no longer on the page. The fact-check didn't flag these. They are recorded here, not fixed.

## Evidence

In the PDF, the asterisk on these titles points to an allocation table at the foot of the page. That table shows how the title's pay is split between the department and a trust fund. The site has cut two of those tables at Public Source's request:

- **Department of Finance:** `Director*`, `Assistant Real Estate Supervisor*`, `Senior Assistant, Real Estate*`. The allocation fragment was cut for row 22, item 1.
- **Bureau of Administration (Public Safety):** `Senior Park Ranger*`. The allocation table was cut for row 28.
- **Department of Parks and Recreation:** three titles. Its allocation table is still shown, so the asterisk there is explained.

The summaries above the PDF section drop the asterisk. These are the "Top positions by budget" table and `/personnel/` (row 16, item 2; `positionTitle` in `web/src/lib/personnel.ts`). They show the split as a "Pay split" note under the title instead.

The Bureau of Fire's asterisks ("Battalion Chief *", "Deputy Chief *") are explained on the same page by the PDF's note "*Promoted after Jan. 1, 2010", so they're fine.

## Approaches

- Strip the trailing asterisk from position titles in the reproduced tables wherever the section has no asterisk note on that page.
- Leave it as it is: the source PDF is linked from every table.
