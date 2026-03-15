---
name: plan
description: Create a forward-looking implementation plan in docs/plans/. Use when designing a new feature, refactoring, or multi-step project.
---

# Create an Implementation Plan

The user wants to create a plan for upcoming work. This goes in `docs/plans/`.

The plan topic is: `$ARGUMENTS`
(If blank, ask the user what they want to plan.)

## Gather Context

Understand what's needed by:
1. Reading relevant code and existing docs
2. Asking the user about scope, constraints, and goals (if not clear)

## Create the Document

Create a file in `docs/plans/` with the naming convention:
`YYYY-MM-DD-short-kebab-description.md`

Use this template:

```markdown
# [Plan Title]

**Date:** YYYY-MM-DD
**Status:** draft | in-progress | completed | abandoned

## Goal

[What this plan achieves. 1-2 sentences.]

## Current State

[Brief description of how things work now, relevant to what's changing.]

## Proposed Approach

[The plan itself. Use numbered steps for sequential work, bullets for parallel items.]

## Files Affected

- `path/to/file` — what changes

## Open Questions

- [Things that need to be resolved before or during implementation]

## Risks

- [What could go wrong, and how to mitigate]
```

## After Creating

1. Review the plan with the user
2. Adjust based on their feedback
3. Note: plans should be updated as work progresses (status field especially)
