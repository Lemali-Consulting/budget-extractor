# "View source page" shows only the first page of a table that spans two

**Date:** 2026-11-14
**Status:** open

A table that runs across two PDF pages is shown on the site as one table, but its source-page link opens only the page where it starts. A fact-checker can't see the rest of the table in the PDF image. Not yet fixed. It affects department and section pages as well as the data explorer, which has been retired.

## Evidence

- Public Source's fact-checker (Rich's factcheck sheet, row 6, 2026-11-13) checked the Bureau of EMS financial summary: "(view source page) doesn't encompass entire table, cuts off at Supplies: Parts".
- In the built data (`web/src/data/budget-data.json`), the table is `s24_p5_t0`. It has 52 rows, all on the site as one table, with `relative_page: 5`. Its 2027 total ($39,385,034) is printed on the following page of the Nov. 9 PDF.
- The table viewer passes that single page to the page image: `web/src/components/TableViewer.astro:174` (`page={table.relative_page}`). The tables carry no end page, so the viewer has no way to know the table continues.

## Why it matters

Public Source fact-checks each page against the PDF image. A table whose totals sit on the next page looks wrong, or can't be checked, from the image alone.

## Approaches (not yet chosen)

- Record each table's last page when continuation tables are merged in the data build, and have the lightbox step through every page.
- Or show the page range in the locator text ("Pages 160–161, table 1"), so readers know to look further.
