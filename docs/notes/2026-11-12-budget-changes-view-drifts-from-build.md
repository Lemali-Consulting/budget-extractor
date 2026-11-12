# The committed 2027 budget-changes view doesn't match what the data build writes

**Date:** 2026-11-12
**Status:** open

Rebuilding the 2027 web data writes a different `shiftedPositions` list into `web/src/data/views/budget-changes.json` than the one committed. The committed list includes, for example, "Operations Coordinator", moved from the Bureau of Administration (Public Works) to the Department of Mobility and Infrastructure. The rebuilt list starts with "Community Resilience Program Manager", moved out of the Stop the Violence Trust Fund. I restored the committed file rather than commit the drift alongside the glossary edits.

## Evidence

- `uv run --no-active scripts/build_web_data.py --year 2027 --operating-variant proposed --capital-variant proposed` (2026-11-12): `git diff --stat` showed `budget-changes.json | 194 +++---`, all of it inside `shiftedPositions`.
- `deploy.sh` runs the same build before every production deploy, so production would get the rebuilt list, not the committed one.

## Why it may not matter

The shifted-position lists were retired from department pages, the brief and the compare page earlier this session (client request, 2026-11-12). On 2026-11-12, only the unpublished "What changed" page read `shiftedPositions` (`web/src/components/pages/ChangesPage.astro:81`, via `PositionChanges.tsx`), so the drift doesn't show on any published page. To recheck, run `grep -rn shiftedPositions web/src`.

## Open question

Should the rebuilt file be committed? Or should the builder stop writing a view nothing reads? Either way, the cause of the change in the build's output (an input or code change since the last commit) hasn't been traced.
