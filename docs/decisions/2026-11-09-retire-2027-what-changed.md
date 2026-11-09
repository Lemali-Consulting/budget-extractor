# Retire the 2027 "What Changed" presentation

**Date:** 2026-11-09
**Status:** accepted

## Context

The headline site carried a "What Changed in FY2027 Proposed?" page (`/changes/`), plus a home-page callout, a "Try" chip, a quick-link tile, a nav item, a Brief section ("What changed this year?") and search entries that all pointed to it. The page compares each department's 2027 budget with its 2026 budget and lists new, eliminated and shifted positions.

The client objected that the 2027 budget moves functions and spending categories from one department to another. A department-by-department table shows those moves as large increases in one place and decreases in another, which reads as policy change when it is reorganization (client argument relayed by Max, 2026-11-09).

## Decision

Retire the headline presentation for now (Max, 2026-11-09, "for the moment I'd say we should retire that"):

- `/changes/` is no longer built for the headline year and returns 404.
- The home callout, "What new positions were added?" chip and quick-link tile are removed; the quick links drop to four columns.
- The "What Changed" nav item is removed from both layouts.
- The Brief's "What changed this year?" section is removed (it showed the same department increase/decrease comparison); the Brief now has five sections.
- The headline personnel page no longer links to the changes page.
- The headline Fuse search index omits the budget-change entries (`build_web_data.py` skips them for the unprefixed build).

Kept:

- The archive pages `/2026/changes/` (2026 vs 2025) and the `[year]` route, since the objection is about the 2027 reorganization. The 2026 archive notice on that page now points at the headline home page instead of a headline equivalent.
- The embeddable charts (`/embed/budget-increases/`, `/embed/budget-decreases/`, `/embed/personnel-changes/`), because external sites may embed them. Whether these go too is open.
- The underlying `budget-changes.json` view, which the Brief's workforce stats and the embeds still read.

No redirect was added for `/changes/`; old links get the 404 page.

## Alternatives Considered

- **Keep the page with a caveat banner** — rejected by the client's argument: the table itself is the misleading part.
- **A presentation that follows functions across departments** (e.g. matching cost centres, or a "moved from / moved to" flow between departments) — open for discussion with the client; not built.
