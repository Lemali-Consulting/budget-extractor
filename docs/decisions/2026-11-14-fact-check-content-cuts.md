# Fact-check content cuts: Grants, the Public Works parent page, and the lower halves of two summaries

**Date:** 2026-11-14
**Status:** accepted

## Context

Public Source's fact-check of the preview (Rich's factcheck sheet "1126", 2026-11-13) asked for these cuts:

- **Row 13, `/sections/grants/`:** "This page is not very user friendly, probably not of huge public interest. Can we cut this one?"
- **Row 47, `/departments/department-of-public-works/`:** "This seems to be extraneous." The parent section holds only prose about its four bureaus: a mission statement, bureau descriptions and an org chart. Each bureau has its own page.
- **Row 18, `/sections/revenue-summary/`:** "cut the section '2027 tax vs. non-tax revenue' and everything below that".
- **Row 19, item 2, `/sections/expenditure-summary/`:** "cut everything from 'Expenditures by subclass' down".
- **Row 26, `/sections/expenditures-detail/`:** the two repeated "Expenditure account summary" headings at the bottom.
- **Row 28:** the allocation table. The row was filed against the Public Works administration page, but the table is on Public Safety administration's page.

Grants had been cut once before and then brought back as the only list of each grant (Max, 2026-11-12). Max chose to make all of group 3's cuts (2026-11-14).

## Decision

- **Grants and the Public Works parent are no longer built.** The site publishes 43 pages. Old links to either page, including the old `/sections/department-of-public-works/` path, redirect to `/operating/`. Names that linked to them now show as plain text.
- **The two summaries end where Rich asked.**
  - The revenue summary ends after its "Major tax revenues" paragraph (PDF page 31).
  - The expenditure summary ends after the Public Works and City Council paragraph on PDF page 47, just before the "Expenditures by subclass" subheading. Its two tables on page 45 stay. Those are the department table and the subclass table. "Expenditures by subclass" is the only heading with that name, so that is where the cut starts.
- **The allocation table on the Public Safety administration page is cut.**
- **The repeated "Expenditure account summary" headings** were already gone, removed with the other repeated PDF headings in the group 2 fixes. The test now pins this.

Each in-page cut is an entry in `web/src/lib/omitted-content.ts` that cites its sheet row. An entry that matches nothing fails the build.

## Why

Public Source fact-checks every published page. Content they judge unhelpful to readers costs fact-checking time without serving anyone. The PDF is still linked from every section page for readers who want the rest.
