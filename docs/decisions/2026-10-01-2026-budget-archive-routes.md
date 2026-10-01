# Keep the 2026 budget browsable as a year-scoped archive

**Date:** 2026-10-01
**Status:** accepted

## Context

Making 2027-proposed the headline means the department, section and capital pages show 2027. 2026 had no pages of its own; the amendments page links into section pages to show the April 2026 amendment's cell-level changes, and the stories are written about 2026 figures.

## Decision

The 2026 budget (operating as amended, capital) stays fully browsable under year-scoped routes. The headline pages stay at their current URLs and show 2027; the archive mirrors the budget-content pages at `/2026/...` (operating index, sections, departments, capital, changes, personnel), with its own source-page and chart images. Amendment highlights and the adopted/amended image toggle appear only on 2026 archive pages. Stories, `/amendments` and `/cross-year` stay pinned to 2026 data and link into the archive. (The user chose this option.)

## Alternatives Considered

- **Comparison-only 2026**: no 2026 pages; amendment links dropped. Rejected by the user. It is less work, but the amendment highlights and the 2026 source pages would become unreachable.

## Consequences

- Page bodies become components parameterized by a year's data, so the headline and archive routes share one implementation.
- Page and chart images move to per-year folders (`/pages/{year}/{slug}/`, `/charts/{year}/{slug}/`).
- The 2026 bundle is rebuilt under a `2026-` prefix. The amendment diff reads that bundle rather than the unprefixed headline.
- When the December adopted 2027 budget arrives, the same mechanism can archive 2027-proposed or replace it in place.
