# Show the PDF's pay splits on every position line they cover

**Date:** 2026-11-12
**Status:** accepted

## Context

When one job title is paid from more than one fund, the 2027 PDF prints a small "2027 Allocations" table in one of those funds' sections, e.g. "Senior Park Ranger — Public Safety Administration General Fund 12%, Parks RAD Trust Fund 88%" (p. 153, repeated on p. 274). Each fund's position table then lists only its own share of the headcount and dollars:
- Public Safety Administration: 0.12 positions, $7,977;
- RAD parks: 1.88 positions, $124,976.

The PDF marks only some of those lines with "*". RAD's Senior Park Ranger and Mellon Park's Park Ranger and Operations Administrator are split but unstarred. Fire's Deputy Chief* and Battalion Chief* are starred but appear in no split table. On the site the asterisk was plain text, so a reader had no way to connect the two lines.

Max was offered two choices: a hover note on starred titles only, or a note on every line a split table covers. Max chose every covered line (2026-11-12, "b, show the split on every covered row").

## Decision

- **Data build:** the build attaches each split table to the lines it covers in every fund it names (`utils/fund_splits.py`). Each covered line in the personnel view gets a `fundSplit` list: the fund as the PDF names it, its section and its percentage.
  - The PDF sometimes shortens titles in its split tables: "Assistant Director" for "Assistant Director of Administration & Senior Programs*", and "Program Coordinator 3" for "Program Coordinator 3, Special Events*".
  - So a split title matches a funded line in that fund's section whose title is the same. Failing that, it matches a starred line whose title starts with it.
  - Lines with no headcount are ignored. Parks lists unfunded "Assistant Director", "Operations Administrator" and "Program Coordinator 3" lines.
- **Failing the build:** the build stops on a fund name no section matches, on a split title that matches no funded line or more than one, and on two tables splitting the same line differently. Three fund names don't match their section's title, so they are mapped by hand: Public Safety Administration General Fund, Parks and Recreation General Fund and Parks RAD Trust Fund.
- **Display:** on department pages and in the personnel explorer, a covered line shows "Pay split: 12% Public Safety Administration General Fund, 88% Parks RAD Trust Fund" under its title. Each fund links to its section page. Section pages and the data explorer are unchanged: they reproduce the PDF tables, the split tables included.
- In 2027 the split tables cover 16 lines across 8 departments and trust funds.

## Consequences

- **A split can cover only part of a line.** The note gives the PDF's split for the title. Its percentages don't always describe the whole line.
  - The two Senior Park Ranger lines (0.12 + 1.88) are one ranger split 12/88 plus one paid entirely from RAD.
  - RAD's 5.6 Park Rangers are one ranger split 40/60 with Mellon Park plus five on RAD alone.
  - The note doesn't say how many of a line's positions the split applies to. The PDF doesn't say either; it would have to be derived.
- One split table is headed "2026 Allocations" (Special Events Trust Fund, Program Coordinator 3) although it sits in the 2027 document. The site shows it as the 2027 split without comment.
- Re-running the build for an archive year may stop on fund names that aren't mapped. Add them to the alias map when that happens.
